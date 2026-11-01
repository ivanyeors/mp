-- Engaged and unengaged: a simple sunset rule, read from the Lifecycle stage
-- (PRD-campaign-audiences slice 12; owner decision 4 of 2026-10-31: "a simple
-- rule based filter, with our customer's lifecycle stage in mind").
--
-- A Customer is **Unengaged** when they clicked none of their latest 6
-- campaign emails and either
--   - they are *At risk · Lapsed* (no purchase or attended booking for over
--     24 months), or
--   - they are a *Lead* (never bought) who has been a Customer here for over
--     12 months (`customers.created_at`; an imported Customer's is the import,
--     as the Shopify export carries no sign-up date).
-- *New*, *Loyal* and *At risk* under 24 months are never Unengaged: they
-- bought or visited within 24 months. *Lost* is already out (unsubscribed).
-- Someone sent fewer than 6 campaigns is never Unengaged. A campaign email
-- counts when the provider accepted it (sent, or since bounced or
-- complained), as `campaigns_sent` does; a held-out row sent nothing, and a
-- migration-wave send is no campaign.
--
-- Unengaged is a sending choice, never a Lifecycle stage and never consent:
-- it moves no stage, and the Profile still reads *subscribed*. It is derived,
-- never stored, so a purchase or a click ends it at once.
--
-- 1. customer_unengaged(stage, detail, since, sent, clicked, now): the rule,
--    once. The twin of `isUnengaged()` in lib/crm/engagement.ts, with the
--    same constants (6 campaigns, 12 months).
-- 2. admin_customer_overview appends `unengaged`, after `last_emailed_at`:
--    the Customers list's *Engagement* filter reads it, and so does the rule
--    below, so the list and the send always agree. Every other column keeps
--    its place, expression and joins; the new lateral join gives one row per
--    Customer. CUSTOMER_OVERVIEW_COLUMNS lists the same columns.
-- 3. email_campaigns.include_unengaged: off by default. A win-back campaign
--    (to *At risk · Lapsed*) turns it on. Part of the Audience, so
--    email_campaigns_guard() freezes it with the Audience at the first wave.
-- 4. marketing_campaign_blocker(): `unengaged` after `already_sent` and
--    before `resting`, unless the campaign includes them.
--    composedCampaignBlocker is the same rule; campaign-rule-cases.json holds
--    the two equal. The claim runs the blocker, so it needs no change: an
--    Unengaged Customer gets no ledger row, and a later Wave reaches them if
--    they re-engage.
--
-- Nothing on `main` reads the new column or the new reason before the code
-- that does, so this is safe to apply first: until then the editor saves no
-- `include_unengaged`, so every campaign leaves the Unengaged out, which is
-- the rule. Everything stays server-only. Idempotent.

-- ---------------------------------------------------------------------
-- 1. The rule
-- ---------------------------------------------------------------------
create or replace function public.customer_unengaged(
  p_stage          text,
  p_detail         text,
  p_customer_since timestamptz,
  p_latest_sent    int,
  p_latest_clicked int,
  p_now            timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  -- UNENGAGED_AFTER_CAMPAIGNS = 6, LEAD_UNENGAGED_AFTER_MONTHS = 12 (lib/crm/engagement.ts).
  select coalesce(
    p_latest_sent >= 6
    and p_latest_clicked = 0
    and (
      (p_stage = 'at_risk' and p_detail = 'lapsed')
      or (p_stage = 'lead'
          and p_customer_since < ((p_now at time zone 'UTC') - interval '12 months') at time zone 'UTC')
    ),
    false)
$$;

revoke execute on function public.customer_unengaged(text, text, timestamptz, int, int, timestamptz) from public, anon, authenticated;
grant execute on function public.customer_unengaged(text, text, timestamptz, int, int, timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- 2. The overview: `unengaged`
-- ---------------------------------------------------------------------
-- As 20261031152806, with `unengaged` appended.
create or replace view public.admin_customer_overview with (security_invoker = true) as
select
  c.id,
  c.email,
  c.first_name,
  c.last_name,
  c.phone,
  c.tags,
  c.total_orders,
  c.total_spent,
  c.created_at,
  c.auth_user_id is not null as has_account,
  c.account_linked_at,
  c.account_last_seen_at,
  m.customer_id is not null  as from_shopify,
  m.created_by_import,
  m.imported_at,
  m.claimed_at,
  m.shopify_orders_count,
  m.shopify_amount_spent,
  -- CRM 11 (20261020200000): Contact status.
  c.account_providers,
  not public.is_blank_phone(c.phone) as has_phone,
  public.is_valid_phone(c.phone)     as phone_valid,
  -- Migration slice 06 (20261020200100): the Claim link.
  (select min(cl.first_clicked_at)
     from public.customer_claim_links cl
    where cl.customer_id = c.id)                               as claim_link_first_clicked_at,
  -- PRD-loyalty-points slice 06: Points, and the Claim bonus.
  coalesce(pt.points_available, 0)::int as points_available,
  pt.claim_bonus_at,
  -- CRM 06 (20261020200200): Follow-ups not done yet.
  coalesce(f.open_followups, 0)::int as open_followups,
  -- CRM slice 04 (20261020200300): what they bought, when, and whether they were re-adjusted.
  coalesce(po.paid_orders, 0)        as paid_orders,
  po.first_paid_at,
  po.last_paid_at,
  coalesce(pl.bought, '{}'::text[])  as bought,
  rb.last_readjusted_at,
  lower(c.email || ' ' || coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')) as search_text,
  -- Migration 07 (20261020200400): Marketing consent.
  c.marketing_email,
  c.marketing_email_updated_at,
  -- CRM slice 12 (20261020200500): reviews.
  rq.asked_at                        as review_requested_at,
  rr.first_clicked_at                as review_link_clicked_at,
  gr.star_rating                     as google_review_rating,
  gr.reviewed_at                     as google_reviewed_at,
  coalesce(sr.shop_reviews_count, 0) as shop_reviews_count,
  sr.shop_review_avg_rating,
  coalesce(gr.star_rating::int, round(sr.shop_review_avg_rating)::int) as review_rating,
  -- Migration 08 (20261020200700): the latest campaign email the provider accepted.
  (select max(cs.sent_at)
     from public.customer_campaign_sends cs
    where cs.customer_id = c.id
      and cs.status in ('sent', 'bounced', 'complained'))      as last_campaign_sent_at,
  -- PRD-crm-retention-loop slice 03: the Lifecycle stage. Purchases here plus
  -- the Shopify-era count until slice 09 imports those Orders; attended
  -- Re-adjustment bookings; and the unsubscribe, if they are unsubscribed.
  coalesce(pu.purchases, 0) + coalesce(m.shopify_orders_count, 0) as purchases,
  pu.last_purchase_at,
  public.customer_lifecycle_stage(
    coalesce(pu.purchases, 0) + coalesce(m.shopify_orders_count, 0),
    pu.last_purchase_at,
    coalesce(rb.attended_bookings, 0), rb.last_readjusted_at,
    case when c.marketing_email = 'unsubscribed' then c.marketing_email_updated_at end,
    now())                                                     as lifecycle_stage,
  public.customer_lifecycle_detail(
    coalesce(pu.purchases, 0) + coalesce(m.shopify_orders_count, 0),
    pu.last_purchase_at, pu.last_purchase_delivered_at,
    coalesce(rb.attended_bookings, 0), rb.last_readjusted_at,
    case when c.marketing_email = 'unsubscribed' then c.marketing_email_updated_at end,
    now())                                                     as lifecycle_detail,
  coalesce(m.shopify_orders_count, 0) > 0
    and pu.last_purchase_at is null                            as lifecycle_undated,
  -- The funnel (owner, 2026-10-28): attended Re-adjustment bookings.
  coalesce(rb.attended_bookings, 0)                            as attended_bookings,
  -- Campaign audiences slice 04 (20261031144619): the sizes of the pillows they
  -- bought, the latest purchase's delivery, and the stage with its sub-status.
  coalesce(pl.pillow_sizes, '{}'::text[])                       as pillow_sizes,
  pu.last_purchase_delivered_at                                as last_delivered_at,
  array_remove(array[
    public.customer_lifecycle_stage(
      coalesce(pu.purchases, 0) + coalesce(m.shopify_orders_count, 0),
      pu.last_purchase_at,
      coalesce(rb.attended_bookings, 0), rb.last_readjusted_at,
      case when c.marketing_email = 'unsubscribed' then c.marketing_email_updated_at end,
      now()),
    public.customer_lifecycle_detail(
      coalesce(pu.purchases, 0) + coalesce(m.shopify_orders_count, 0),
      pu.last_purchase_at, pu.last_purchase_delivered_at,
      coalesce(rb.attended_bookings, 0), rb.last_readjusted_at,
      case when c.marketing_email = 'unsubscribed' then c.marketing_email_updated_at end,
      now())
  ], null)                                                     as lifecycle_statuses,
  -- Campaign audiences slice 05 (20261031152806): where they are, what they read,
  -- and what campaigns they got and clicked.
  coalesce(so.country, ad.country)                             as ship_country,
  c.locale,
  coalesce(cs.campaigns_sent, '{}'::text[])                    as campaigns_sent,
  coalesce(cs.campaigns_clicked, '{}'::text[])                 as campaigns_clicked,
  coalesce((select max(cs2.sent_at)
              from public.customer_campaign_sends cs2
             where cs2.customer_id = c.id
               and cs2.status in ('sent', 'bounced', 'complained')),
           '-infinity'::timestamptz)                           as last_emailed_at,
  -- Campaign audiences slice 12 (this file): Unengaged, the sunset rule.
  public.customer_unengaged(
    public.customer_lifecycle_stage(
      coalesce(pu.purchases, 0) + coalesce(m.shopify_orders_count, 0),
      pu.last_purchase_at,
      coalesce(rb.attended_bookings, 0), rb.last_readjusted_at,
      case when c.marketing_email = 'unsubscribed' then c.marketing_email_updated_at end,
      now()),
    public.customer_lifecycle_detail(
      coalesce(pu.purchases, 0) + coalesce(m.shopify_orders_count, 0),
      pu.last_purchase_at, pu.last_purchase_delivered_at,
      coalesce(rb.attended_bookings, 0), rb.last_readjusted_at,
      case when c.marketing_email = 'unsubscribed' then c.marketing_email_updated_at end,
      now()),
    c.created_at,
    coalesce(en.sent, 0),
    coalesce(en.clicked, 0),
    now())                                                     as unengaged
from public.customers c
left join public.migrated_customers m on m.customer_id = c.id
-- The balance is the sum of the ledger (ADR 0030 (q)); at most one
-- claim_bonus entry per Customer (points_ledger_one_claim_bonus).
left join (
  select l.customer_id,
         sum(l.points)                                          as points_available,
         min(l.created_at) filter (where l.kind = 'claim_bonus') as claim_bonus_at
    from public.points_ledger l
   group by l.customer_id
) pt on pt.customer_id = c.id
left join (
  select customer_id, count(*) as open_followups
  from public.customer_followups
  where done_at is null
  group by customer_id
) f on f.customer_id = c.id
left join (
  select o.customer_id,
         count(*)::int  as paid_orders,
         min(o.paid_at) as first_paid_at,
         max(o.paid_at) as last_paid_at
    from public.orders o
   where o.customer_id is not null
     and o.paid_at is not null
     and o.status not in ('pending', 'cancelled', 'refunded', 'payment_failed')
   group by o.customer_id
) po on po.customer_id = c.id
left join (
  select l.customer_id,
         array_remove(array[
           case when bool_or(l.product_type = 'pillow' and l.tier = 'premium') then 'premium' end,
           case when bool_or(l.product_type = 'pillow' and l.tier = 'basic')   then 'basic' end,
           case when bool_or(l.product_type = 'bolster')                       then 'mbolster' end,
           case when bool_or(l.product_type = 'accessory')                     then 'accessory' end
         ], null) as bought,
         array_remove(array[
           case when bool_or(l.product_type = 'pillow' and upper(btrim(l.size)) = 'XS') then 'XS' end,
           case when bool_or(l.product_type = 'pillow' and upper(btrim(l.size)) = 'S') then 'S' end,
           case when bool_or(l.product_type = 'pillow' and upper(btrim(l.size)) = 'M') then 'M' end,
           case when bool_or(l.product_type = 'pillow' and upper(btrim(l.size)) = 'L') then 'L' end,
           case when bool_or(l.product_type = 'pillow' and upper(btrim(l.size)) = 'XL') then 'XL' end
         ], null) as pillow_sizes
    from public.customer_purchase_lines l
   where l.customer_id is not null
   group by l.customer_id
) pl on pl.customer_id = c.id
left join (
  select b.customer_id,
         max(b.start_at) as last_readjusted_at,
         count(*)::int   as attended_bookings
    from public.readjustment_bookings b
   where b.status = 'attended'
   group by b.customer_id
) rb on rb.customer_id = c.id
-- CRM slice 12: asked on, by either channel.
left join (
  select s.customer_id, min(s.sent_at) as asked_at
    from (
      select e.customer_id, e.sent_at
        from public.customer_emails e
       where e.template = 'aftercare.review_request'
         and e.entity_id = e.customer_id
         and e.status = 'sent'
         and e.sent_at is not null
      union all
      select w.customer_id, w.sent_at
        from public.customer_whatsapp w
       where w.template = 'aftercare.review_request'
         and w.entity_id = w.customer_id
         and w.status = 'sent'
         and w.sent_at is not null
    ) s
   group by s.customer_id
) rq on rq.customer_id = c.id
-- Once per Customer: its primary key is the Customer.
left join public.customer_review_requests rr on rr.customer_id = c.id
left join (
  select distinct on (l.customer_id)
         l.customer_id,
         g.star_rating,
         coalesce(g.review_created_at, g.created_at) as reviewed_at
    from public.customer_google_reviews l
    join public.google_reviews g on g.id = l.google_review_id
   order by l.customer_id, coalesce(g.review_created_at, g.created_at) desc
) gr on gr.customer_id = c.id
left join (
  select r.customer_id,
         count(*)::int              as shop_reviews_count,
         round(avg(r.rating), 1)    as shop_review_avg_rating
    from public.product_reviews r
   where r.customer_id is not null
   group by r.customer_id
) sr on sr.customer_id = c.id
-- Slice 03: purchases, the counted Orders (as `po` above) that hold a goods
-- line, so a re-adjustment fee Order (service lines only) is never one.
left join (
  select o.customer_id,
         count(*)::int  as purchases,
         max(o.paid_at) as last_purchase_at,
         (array_agg(o.delivered_at order by o.paid_at desc, o.id desc))[1] as last_purchase_delivered_at
    from public.orders o
   where o.customer_id is not null
     and o.paid_at is not null
     and o.status not in ('pending', 'cancelled', 'refunded', 'payment_failed')
     and exists (select 1
                   from public.order_items i
                  where i.order_id = o.id
                    and i.kind = 'goods')
   group by o.customer_id
) pu on pu.customer_id = c.id
-- Slice 05: the latest counted Order's country, when it names one.
left join lateral (
  select upper(btrim(o.shipping_address ->> 'country')) as country
    from public.orders o
   where o.customer_id = c.id
     and o.paid_at is not null
     and o.status not in ('pending', 'cancelled', 'refunded', 'payment_failed')
     and upper(btrim(o.shipping_address ->> 'country')) ~ '^[A-Z]{2}$'
   order by o.paid_at desc, o.id desc
   limit 1
) so on true
-- Else the default address, else the latest one saved.
left join lateral (
  select upper(btrim(a.country)) as country
    from public.customer_addresses a
   where a.customer_id = c.id
     and upper(btrim(a.country)) ~ '^[A-Z]{2}$'
   order by a.is_default desc, a.updated_at desc, a.id desc
   limit 1
) ad on true
-- The campaigns the provider accepted for them, and those they clicked.
-- A migration-wave send has no campaign and is not one.
left join (
  select s.customer_id,
         array_agg(distinct s.campaign_id::text)
           filter (where s.status in ('sent', 'bounced', 'complained')) as campaigns_sent,
         array_agg(distinct s.campaign_id::text)
           filter (where s.first_clicked_at is not null)               as campaigns_clicked
    from public.customer_campaign_sends s
   where s.campaign_id is not null
   group by s.customer_id
) cs on cs.customer_id = c.id
-- Slice 12: their latest 6 campaign emails the provider accepted, and how
-- many of those they clicked. A migration-wave send has no campaign and is
-- not one; nor is a held-out row, which sent nothing.
left join lateral (
  select count(*)::int                                          as sent,
         count(*) filter (where l.first_clicked_at is not null)::int as clicked
    from (
      select s.first_clicked_at
        from public.customer_campaign_sends s
       where s.customer_id = c.id
         and s.campaign_id is not null
         and s.status in ('sent', 'bounced', 'complained')
       order by s.sent_at desc, s.id desc
       limit 6
    ) l
) en on true;

revoke all on public.admin_customer_overview from anon, authenticated;
grant select on public.admin_customer_overview to service_role;

-- ---------------------------------------------------------------------
-- 3. A campaign may include the Unengaged
-- ---------------------------------------------------------------------
alter table public.email_campaigns
  add column if not exists include_unengaged boolean not null default false;

comment on column public.email_campaigns.include_unengaged is
  'Send to Unengaged Customers too (PRD-campaign-audiences slice 12): a win-back. Off by default; locks with the Audience.';

-- As 20261031144834, with `include_unengaged` frozen with the Audience.
create or replace function public.email_campaigns_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.locked_at is not null and (
       new.subject is distinct from old.subject
    or new.preheader is distinct from old.preheader
    or new.body is distinct from old.body
    or new.content is distinct from old.content
    or new.greeting is distinct from old.greeting
    or new.button_label is distinct from old.button_label
    or new.button_target is distinct from old.button_target
    or new.button_url is distinct from old.button_url
    or new.audience is distinct from old.audience
    or new.segment_id is distinct from old.segment_id
    or new.exclude_segment_ids is distinct from old.exclude_segment_ids
    or new.include_unengaged is distinct from old.include_unengaged
    or new.locked_at is distinct from old.locked_at
  ) then
    raise exception 'This campaign has started sending, so its email and audience cannot change. Duplicate it to send a changed one.'
      using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 4. The rule: `unengaged` before `resting`
-- ---------------------------------------------------------------------
-- As 20261031162653, with `unengaged`. The overview is read for this one
-- Customer, as the claim reads their stage.
create or replace function public.marketing_campaign_blocker(
  p_customer_id  uuid,
  p_campaign_id  uuid,
  p_retry_failed boolean default false
)
returns text
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when e.id is null then 'unknown_campaign'
    when e.archived_at is not null then 'campaign_archived'
    when c.id is null then 'not_found'
    when e.audience = 'imported_not_signed_in' and m.customer_id is null then 'not_migrated'
    when e.audience = 'imported_not_signed_in' and m.claimed_at is not null then 'claimed'
    when c.marketing_email = 'unsubscribed' then 'unsubscribed'
    when exists (
      select 1 from customer_campaign_sends s
       where s.customer_id = k.id
         and (s.status in ('bounced', 'complained') or s.bounced_at is not null or s.complained_at is not null)
    ) then 'suppressed'
    when c.marketing_email <> 'subscribed' then 'not_subscribed'
    when own.status = 'failed' and not coalesce(p_retry_failed, false) then 'failed'
    when own.status = 'held_out' then 'held_out'
    when own.status is not null and own.status <> 'failed' then 'already_sent'
    when not e.include_unengaged
     and coalesce((select o.unengaged from admin_customer_overview o where o.id = k.id), false) then 'unengaged'
    when public.marketing_rest_until(k.id) is not null then 'resting'
    else null
  end
  from (select p_customer_id as id) k
  left join email_campaigns e on e.id = p_campaign_id
  left join customers c on c.id = k.id
  left join migrated_customers m on m.customer_id = c.id
  left join customer_campaign_sends own
    on own.customer_id = k.id and own.template = 'campaign:' || p_campaign_id::text;
$$;

revoke execute on function public.marketing_campaign_blocker(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function public.marketing_campaign_blocker(uuid, uuid, boolean) to service_role;
