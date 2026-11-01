-- Results per campaign: clicks, unsubscribes, and purchases after it, by the
-- Lifecycle stage each person had when sent (PRD-campaign-audiences slice 11;
-- retention metric M22). An optional holdout for a campaign that keeps
-- sending (owner decision 5: off until it has passed 500 people sent).
--
-- 1. The ledger keeps the stage. `customer_campaign_sends.stage_at_send` is
--    the Customer's Lifecycle stage when the claim was made, read from
--    `admin_customer_overview` (so it is the CRM's own rule, never a copy),
--    since the stage moves. Null on sends from before this migration and on
--    the migration's own templates.
--
-- 2. A holdout. `email_campaigns.holdout_at`: when a person turned it on;
--    null is off. Only a campaign that keeps sending may have one. While it is
--    on, the claim records a stable 10% of the people it would send to as
--    `held_out` on the ledger instead: no email, so the provider's room, the
--    rest period and every *sent* count ignore the row. The row is the
--    (Customer, campaign) key, so they never receive that campaign, by the
--    daily job or a person's later Wave, even after the holdout is turned off.
--    The 10% is `campaign_holdout_bucket(customer) < 10`: the first 32 bits of
--    the md5 of the Customer id, mod 100. Stable, and the same people for
--    every campaign that holds out (a holdout across Playbooks, not a new 10%
--    each time). A held-out row's `sent_at` is when it would have been sent.
--    A retried failure is not held out: it was chosen to be sent before.
--
-- 3. marketing_campaign_blocker(): `held_out` before `already_sent`, so a plan
--    says why. composedCampaignBlocker is the same rule;
--    campaign-rule-cases.json holds the two equal.
--
-- 4. email_campaign_send_outcomes: one row per campaign send that went out,
--    or was held out, with what followed:
--      clicked, complained, unsubscribed  as email_campaign_stats counts them
--      purchases     **Purchases** paid in the 30 days after `sent_at`: a
--                    counted Order (paid; not pending, cancelled, refunded or
--                    payment-failed) with a goods line, as
--                    admin_customer_overview's `pu` reads them. A
--                    re-adjustment fee Order holds only service lines and is
--                    never one.
--      spent         those Orders' totals less what was refunded
--      bought_after_click  one of them was paid after their first click
--      counting      sent under 30 days ago: the window is still open
--    A purchase after an email is not proof the email caused it; the holdout
--    is how that is measured.
--
-- 5. email_campaign_stats gains bought, bought_after_click, bought_total,
--    counting and held_out (the existing columns unchanged).
--
-- 6. email_campaign_stage_results: the same numbers by `cohort` and `stage`:
--      sent                the people it went to
--      held_out            the people held out
--      sent_since_holdout  of `sent`, those sent once the first person was
--                          held out: the fair comparison, the same weeks
--    `stage` is `stage_at_send`, `unknown` where none was kept. The retention
--    scorecard's M22 reads `sent` from here.
--
-- 7. customer_campaign_wave_stats gains `held_out`; marketing_campaign_candidates
--    gains `holdout_bucket`, so a plan can say who a holdout will keep back.
--
-- Everything stays server-only. Idempotent.

-- ---------------------------------------------------------------------
-- 1. The ledger: the stage at send, and a held-out row
-- ---------------------------------------------------------------------
alter table public.customer_campaign_sends
  add column if not exists stage_at_send text null;

alter table public.customer_campaign_sends drop constraint if exists customer_campaign_sends_stage_at_send_check;
alter table public.customer_campaign_sends add constraint customer_campaign_sends_stage_at_send_check
  check (stage_at_send is null or stage_at_send in ('lead', 'new', 'loyal', 'at_risk', 'lost'));

alter table public.customer_campaign_sends drop constraint if exists customer_campaign_sends_status_check;
alter table public.customer_campaign_sends add constraint customer_campaign_sends_status_check
  check (status in ('pending', 'sent', 'failed', 'bounced', 'complained', 'held_out'));

-- Held out: an Email campaign's row that no provider ever saw.
alter table public.customer_campaign_sends drop constraint if exists customer_campaign_sends_held_out_shape;
alter table public.customer_campaign_sends add constraint customer_campaign_sends_held_out_shape
  check (status <> 'held_out' or (
    campaign_id is not null
    and provider_message_id is null
    and click_token_hash is null
    and bounced_at is null
    and complained_at is null
  ));

comment on column public.customer_campaign_sends.stage_at_send is
  'The Customer''s Lifecycle stage when the send was claimed (PRD-campaign-audiences slice 11). Null before 2026-10-31 and for the migration''s templates.';

-- ---------------------------------------------------------------------
-- 2. The holdout
-- ---------------------------------------------------------------------
alter table public.email_campaigns
  add column if not exists holdout_at timestamptz null;

alter table public.email_campaigns drop constraint if exists email_campaigns_holdout_keeps_sending;
alter table public.email_campaigns add constraint email_campaigns_holdout_keeps_sending
  check (holdout_at is null or keep_sending);

comment on column public.email_campaigns.holdout_at is
  'When a person turned the holdout on; null is off. While on, 10% of the people it would send to are held out (PRD-campaign-audiences slice 11).';

-- 0 to 99, the same for a Customer every time.
create or replace function public.campaign_holdout_bucket(p_customer_id uuid)
returns int
language sql
immutable
set search_path = ''
as $$
  select (('x' || left(md5(p_customer_id::text), 8))::bit(32)::bigint % 100)::int
$$;

revoke execute on function public.campaign_holdout_bucket(uuid) from public, anon, authenticated;
grant execute on function public.campaign_holdout_bucket(uuid) to service_role;

-- ---------------------------------------------------------------------
-- 3. The rule: held out reads before already sent
-- ---------------------------------------------------------------------
-- As 20261031144935, with `held_out`.
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

-- ---------------------------------------------------------------------
-- The claim keeps the stage, and holds out
-- ---------------------------------------------------------------------
-- As 20261031144935, with `stage_at_send` and the holdout. The stage is read
-- after the rule, so a refused claim reads nothing more.
create or replace function public.claim_marketing_campaign_send(
  p_customer_id  uuid,
  p_campaign_id  uuid,
  p_wave         text,
  p_retry_failed boolean default false
)
returns table (send_id uuid, blocker text, email text, first_name text, last_name text, locale text, unclaimed_migrated boolean)
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_blocker  text;
  v_id       uuid;
  v_template text := 'campaign:' || p_campaign_id::text;
  v_stage    text;
  v_holdout  boolean;
begin
  if p_wave is null or p_wave !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$' then
    raise exception 'A wave is 1 to 32 letters, digits, - or _, starting with a letter or digit (not %)',
      coalesce(p_wave, 'null') using errcode = 'invalid_parameter_value';
  end if;

  -- Two campaigns claiming one person at once: the second waits here, then
  -- reads the first's `pending` row as a marketing email and rests them.
  perform 1 from customers where id = p_customer_id for update;

  v_blocker := marketing_campaign_blocker(p_customer_id, p_campaign_id, p_retry_failed);
  if v_blocker is not null then
    return query select null::uuid, v_blocker, null::text, null::text, null::text, null::text, null::boolean;
    return;
  end if;

  -- Slice 11: their stage now, as the Customers list shows it.
  select o.lifecycle_stage into v_stage
    from admin_customer_overview o
   where o.id = p_customer_id;

  if coalesce(p_retry_failed, false) then
    update customer_campaign_sends s
       set status = 'pending',
           wave = p_wave,
           sent_at = now(),
           attempts = s.attempts + 1,
           last_error = null,
           provider_message_id = null,
           stage_at_send = v_stage
     where s.customer_id = p_customer_id
       and s.template = v_template
       and s.status = 'failed'
    returning s.id into v_id;
  else
    select e.holdout_at is not null into v_holdout
      from email_campaigns e
     where e.id = p_campaign_id;

    if coalesce(v_holdout, false) and public.campaign_holdout_bucket(p_customer_id) < 10 then
      insert into customer_campaign_sends (customer_id, template, campaign_id, wave, status, stage_at_send)
      values (p_customer_id, v_template, p_campaign_id, p_wave, 'held_out', v_stage)
      on conflict (customer_id, template) do nothing
      returning id into v_id;
      return query select null::uuid,
                          case when v_id is null then 'already_sent' else 'held_out' end,
                          null::text, null::text, null::text, null::text, null::boolean;
      return;
    end if;

    insert into customer_campaign_sends (customer_id, template, campaign_id, wave, status, stage_at_send)
    values (p_customer_id, v_template, p_campaign_id, p_wave, 'pending', v_stage)
    on conflict (customer_id, template) do nothing
    returning id into v_id;
  end if;

  if v_id is null then
    return query select null::uuid, 'already_sent'::text, null::text, null::text, null::text, null::text, null::boolean;
    return;
  end if;

  return query
    select v_id, null::text, c.email, c.first_name, c.last_name, c.locale,
           (m.customer_id is not null and m.claimed_at is null)
      from customers c
      left join migrated_customers m on m.customer_id = c.id
     where c.id = p_customer_id;
end;
$$;

revoke execute on function public.claim_marketing_campaign_send(uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_marketing_campaign_send(uuid, uuid, text, boolean) to service_role;

-- ---------------------------------------------------------------------
-- 4. What followed each send
-- ---------------------------------------------------------------------
create or replace view public.email_campaign_send_outcomes with (security_invoker = true) as
select
  s.id                                  as send_id,
  s.campaign_id,
  s.customer_id,
  s.status = 'held_out'                 as held_out,
  s.stage_at_send,
  s.sent_at,
  s.first_clicked_at is not null        as clicked,
  s.complained_at is not null           as complained,
  exists (
    select 1
      from public.customer_consent_events ev
     where ev.campaign_send_id = s.id
       and ev.to_state = 'unsubscribed'
       and ev.source = 'unsubscribe_link'
  )                                     as unsubscribed,
  coalesce(p.purchases, 0)              as purchases,
  coalesce(p.spent, 0)::numeric(12,2)   as spent,
  coalesce(p.after_click, false)        as bought_after_click,
  s.sent_at > now() - interval '30 days' as counting
from public.customer_campaign_sends s
left join lateral (
  select count(*)::int as purchases,
         sum(greatest(o.total - coalesce(o.amount_refunded, 0), 0)) as spent,
         bool_or(o.paid_at >= s.first_clicked_at) as after_click
    from public.orders o
   where o.customer_id = s.customer_id
     and o.paid_at > s.sent_at
     and o.paid_at <= s.sent_at + interval '30 days'
     and o.status not in ('pending', 'cancelled', 'refunded', 'payment_failed')
     and exists (select 1
                   from public.order_items i
                  where i.order_id = o.id
                    and i.kind = 'goods')
) p on true
where s.campaign_id is not null
  and s.status in ('sent', 'bounced', 'complained', 'held_out');

revoke all on public.email_campaign_send_outcomes from anon, authenticated;
grant select on public.email_campaign_send_outcomes to service_role;

-- ---------------------------------------------------------------------
-- 5. Each Campaign's numbers, with purchases after it
-- ---------------------------------------------------------------------
-- As 20261031152709, with five columns appended. `waves` no longer counts a
-- Wave that only held people out.
create or replace view public.email_campaign_stats with (security_invoker = true) as
select
  e.id as campaign_id,
  count(s.id) filter (where s.status in ('sent', 'bounced', 'complained'))       as handed,
  count(s.id) filter (where s.bounced_at is not null)                            as bounced,
  count(s.id) filter (where s.complained_at is not null)                         as complained,
  count(s.id) filter (where s.status = 'failed')                                 as failed,
  count(s.id) filter (where s.status = 'pending')                                as pending,
  count(distinct s.wave) filter (where s.status <> 'held_out')                   as waves,
  min(s.sent_at) filter (where s.status in ('sent', 'bounced', 'complained'))    as first_sent_at,
  max(s.sent_at) filter (where s.status in ('sent', 'bounced', 'complained'))    as last_sent_at,
  (select count(*) from public.customer_claim_links l
    where l.template = 'campaign:' || e.id::text and l.first_clicked_at is not null) as link_clicks,
  count(s.id) filter (where s.first_clicked_at is not null)                      as clicked,
  coalesce(sum(s.clicks), 0)                                                     as clicks,
  (select count(distinct ev.customer_id)
     from public.customer_consent_events ev
     join public.customer_campaign_sends cs on cs.id = ev.campaign_send_id
    where cs.campaign_id = e.id
      and ev.to_state = 'unsubscribed'
      and ev.source = 'unsubscribe_link')                                        as unsubscribed,
  -- Slice 11.
  count(o.send_id) filter (where not o.held_out and o.purchases > 0)            as bought,
  count(o.send_id) filter (where not o.held_out and o.bought_after_click)        as bought_after_click,
  coalesce(sum(o.spent) filter (where not o.held_out), 0)::numeric(12,2)         as bought_total,
  count(o.send_id) filter (where not o.held_out and o.counting)                  as counting,
  count(s.id) filter (where s.status = 'held_out')                               as held_out
from public.email_campaigns e
left join public.customer_campaign_sends s on s.campaign_id = e.id
left join public.email_campaign_send_outcomes o on o.send_id = s.id
group by e.id;

revoke all on public.email_campaign_stats from anon, authenticated;
grant select on public.email_campaign_stats to service_role;

-- ---------------------------------------------------------------------
-- 6. By stage, and the holdout beside the people sent
-- ---------------------------------------------------------------------
create or replace view public.email_campaign_stage_results with (security_invoker = true) as
with outcomes as (
  select o.*,
         min(o.sent_at) filter (where o.held_out) over (partition by o.campaign_id) as holdout_since
    from public.email_campaign_send_outcomes o
),
cohorts as (
  select o.*, case when o.held_out then 'held_out' else 'sent' end as cohort
    from outcomes o
  union all
  select o.*, 'sent_since_holdout' as cohort
    from outcomes o
   where not o.held_out
     and o.holdout_since is not null
     and o.sent_at >= o.holdout_since
)
select
  c.campaign_id,
  c.cohort,
  coalesce(c.stage_at_send, 'unknown')                  as stage,
  count(*)                                              as people,
  count(*) filter (where c.clicked)                     as clicked,
  count(*) filter (where c.unsubscribed)                as unsubscribed,
  count(*) filter (where c.complained)                  as complained,
  count(*) filter (where c.purchases > 0)               as bought,
  count(*) filter (where c.bought_after_click)          as bought_after_click,
  coalesce(sum(c.spent), 0)::numeric(12,2)              as bought_total,
  count(*) filter (where c.counting)                    as counting
from cohorts c
group by c.campaign_id, c.cohort, coalesce(c.stage_at_send, 'unknown');

revoke all on public.email_campaign_stage_results from anon, authenticated;
grant select on public.email_campaign_stage_results to service_role;

-- ---------------------------------------------------------------------
-- 7. Waves count the held out; candidates carry their holdout bucket
-- ---------------------------------------------------------------------
-- As 20261020130000, with `held_out` appended.
create or replace view public.customer_campaign_wave_stats with (security_invoker = true) as
select
  s.template,
  s.wave,
  count(*) filter (where s.status in ('sent', 'bounced', 'complained'))       as handed,
  count(*) filter (where s.bounced_at is not null)                            as bounced,
  count(*) filter (where s.complained_at is not null)                         as complained,
  count(*) filter (where s.status = 'failed')                                 as failed,
  count(*) filter (where s.status = 'pending')                                as pending,
  min(s.sent_at) filter (where s.status in ('sent', 'bounced', 'complained')) as first_sent_at,
  max(s.sent_at) filter (where s.status in ('sent', 'bounced', 'complained')) as last_sent_at,
  count(*) filter (where s.status = 'held_out')                               as held_out
from public.customer_campaign_sends s
group by s.template, s.wave;

revoke all on public.customer_campaign_wave_stats from anon, authenticated;
grant select on public.customer_campaign_wave_stats to service_role;

-- As 20261031144935, with `holdout_bucket` appended.
create or replace view public.marketing_campaign_candidates with (security_invoker = true) as
select
  c.id as customer_id,
  c.email,
  c.first_name,
  c.locale,
  c.marketing_email,
  (m.customer_id is not null) as migrated,
  m.claimed_at,
  coalesce(m.shopify_orders_count, 0) + coalesce(c.total_orders, 0) as orders_count,
  coalesce(m.imported_at, c.created_at) as since,
  exists (
    select 1 from public.customer_campaign_sends s
     where s.customer_id = c.id
       and (s.status in ('bounced', 'complained') or s.bounced_at is not null or s.complained_at is not null)
  ) as suppressed,
  coalesce(
    (select jsonb_object_agg(s.campaign_id::text, jsonb_build_object(
              'status', s.status,
              'wave', s.wave,
              'sent_at', s.sent_at))
       from public.customer_campaign_sends s
      where s.customer_id = c.id and s.campaign_id is not null),
    '{}'::jsonb
  ) as campaign_sends,
  public.marketing_recent(c.id) as marketing_recent,
  public.campaign_holdout_bucket(c.id) as holdout_bucket
from public.customers c
left join public.migrated_customers m on m.customer_id = c.id;

revoke all on public.marketing_campaign_candidates from anon, authenticated;
grant select on public.marketing_campaign_candidates to service_role;
