-- Retire the Welcome-back voucher (PRD-loyalty-points slice 06; ADR 0030,
-- decision 14). Since slice 05 nothing issues one and no customer sees one;
-- this removes what is left, so the code has one incentive, the Claim bonus.
-- Coupons go back to being bearer codes only.
--
-- 1. The guard, before anything changes. coupons.customer_id and issued_for
--    are dropped only when no coupon is bound to a Customer. Otherwise the
--    migration raises, naming the count, and the owner decides: dropping the
--    columns would turn a code meant for one Customer into a bearer code
--    anyone can use. The voucher was never switched on in production, so the
--    expected count is 0. issued_for implies customer_id
--    (coupons_issued_for_bound), so the guard counts both.
--
-- 2. Drop welcome_voucher_state() and admin_welcome_voucher_summary
--    (20261020121100), and the six welcome_voucher_* settings
--    (20261020112100).
--
-- 3. Rebuild admin_customer_overview and admin_customer_migration_summary
--    from scratch. Earlier migrations redefined them in place because each one
--    kept every column and appended new ones; Postgres refuses to drop or
--    reorder a view column that way. Removing one is `drop view` and
--    `create view`, together with everything that depends on the views. The
--    one dependent (pg_depend) is admin_customer_migration_summary, which
--    reads the overview; it is dropped first and recreated after. The drops
--    are RESTRICT, not CASCADE: a dependent this file does not know about
--    makes the migration fail rather than vanish with the view.
--
--    admin_customer_overview: welcome_voucher_state becomes, in its place,
--      points_available  the Customer's available **Points**: the sum of
--                        their points_ledger entries, as points_balance()
--                        counts `available`; 0 with none
--      claim_bonus_at    when their **Claim bonus** was granted (the one
--                        `claim_bonus` entry); null without one
--    Every other column is kept, in order, with the same expression (the
--    search_text expression must stay idx_customers_search_text_trgm's).
--
--    admin_customer_migration_summary: the four voucher columns become, in
--    their place,
--      claim_bonuses          Migrated customers granted the Claim bonus
--      migrated_points_spent  points they spent on paid Orders
--      points_orders          their paid Orders that used points
--      points_revenue         those Orders' total, SGD
--    The last three read one set of Orders: paid, by a Migrated customer, with
--    points_spent above 0 (points used are never refunded, ADR 0030 (l)).
--
--    The privileges the old views held are kept: they are read from pg_class
--    before the drop and granted again after the create, table and column
--    level, so whatever the database held carries over. Then the repo's
--    server-only rule is applied on top: security_invoker, revoked from anon
--    and authenticated, select for the service role.
--
-- 4. coupons.customer_id and issued_for go, with their check
--    (coupons_issued_for_check), the bound check (coupons_issued_for_bound),
--    the foreign key and their two indexes (coupons_one_per_customer_purpose,
--    idx_coupons_customer).
--
-- CUSTOMER_OVERVIEW_COLUMNS (lib/crm/customer-overview.ts) and
-- MIGRATION_SUMMARY_COLUMNS (lib/customer-migration/overview.ts) list the new
-- columns; lib/crm/__tests__/customer-overview-view.test.ts holds them equal.
--
-- Idempotent: safe to run again. The guard and the column drops check for the
-- columns first, every drop is `if exists`, and the views are rebuilt with
-- their privileges each time.

-- ---------------------------------------------------------------------
-- 1. The guard
-- ---------------------------------------------------------------------
do $$
declare
  v_bound  bigint := 0;
  v_issued bigint := 0;
  v_has_customer boolean;
  v_has_issued   boolean;
begin
  select exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'coupons' and column_name = 'customer_id'),
         exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'coupons' and column_name = 'issued_for')
    into v_has_customer, v_has_issued;

  if v_has_customer then
    execute 'select count(*) from public.coupons where customer_id is not null' into v_bound;
  end if;
  if v_has_issued then
    execute 'select count(*) from public.coupons where issued_for is not null' into v_issued;
  end if;

  if v_bound > 0 or v_issued > 0 then
    raise exception 'Not retiring the Welcome-back voucher: % coupon(s) have issued_for set and % are bound to a Customer (customer_id)', v_issued, v_bound
      using errcode = 'object_not_in_prerequisite_state',
            hint = 'Dropping coupons.customer_id would make each of them a bearer code anyone can use. The owner decides what happens to them first.';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3a. What the old views were granted, before they go
-- ---------------------------------------------------------------------
-- A session temp table, dropped below, and not `on commit drop`: it must
-- outlive a statement if this file is ever run outside one transaction.
drop table if exists pg_temp.retired_voucher_view_acl;
create temp table retired_voucher_view_acl as
select c.relname::text      as view_name,
       null::text           as column_name,
       case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end as grantee,
       a.privilege_type,
       a.is_grantable
  from pg_class c
 cross join lateral aclexplode(c.relacl) a
 where c.oid in (select to_regclass(v) from unnest(array['public.admin_customer_overview',
                                                         'public.admin_customer_migration_summary']) v)
   and a.grantee <> c.relowner
union all
select c.relname::text,
       att.attname::text,
       case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end,
       a.privilege_type,
       a.is_grantable
  from pg_class c
  join pg_attribute att on att.attrelid = c.oid and att.attnum > 0 and not att.attisdropped
 cross join lateral aclexplode(att.attacl) a
 where c.oid in (select to_regclass(v) from unnest(array['public.admin_customer_overview',
                                                         'public.admin_customer_migration_summary']) v)
   and a.grantee <> c.relowner;

-- ---------------------------------------------------------------------
-- 2 and 3b. Drop the voucher's objects and the two views
-- ---------------------------------------------------------------------
-- Dependents first: the summary reads the overview; the voucher summary reads
-- the function.
drop view if exists public.admin_customer_migration_summary;
drop view if exists public.admin_welcome_voucher_summary;
drop view if exists public.admin_customer_overview;
drop function if exists public.welcome_voucher_state(int, boolean, timestamptz);

delete from public.site_settings
 where key in ('welcome_voucher_enabled', 'welcome_voucher_type', 'welcome_voucher_value',
               'welcome_voucher_min_order', 'welcome_voucher_valid_days', 'welcome_voucher_issue_until');

-- ---------------------------------------------------------------------
-- 4. Coupons are bearer codes again
-- ---------------------------------------------------------------------
alter table public.coupons drop constraint if exists coupons_issued_for_bound;
alter table public.coupons drop constraint if exists coupons_issued_for_check;
drop index if exists public.coupons_one_per_customer_purpose;
drop index if exists public.idx_coupons_customer;
-- The foreign key to customers goes with the column.
alter table public.coupons drop column if exists issued_for;
alter table public.coupons drop column if exists customer_id;

-- ---------------------------------------------------------------------
-- 3c. The Customer overview, rebuilt
-- ---------------------------------------------------------------------
create view public.admin_customer_overview with (security_invoker = true) as
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
      and cs.status in ('sent', 'bounced', 'complained'))      as last_campaign_sent_at
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
         ], null) as bought
    from public.customer_purchase_lines l
   where l.customer_id is not null
   group by l.customer_id
) pl on pl.customer_id = c.id
left join (
  select b.customer_id,
         max(b.start_at) as last_readjusted_at
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
) sr on sr.customer_id = c.id;

-- ---------------------------------------------------------------------
-- 3d. The Migration card, rebuilt
-- ---------------------------------------------------------------------
create view public.admin_customer_migration_summary with (security_invoker = true) as
select
  count(*)                                                    as imported,
  count(*) filter (where o.created_by_import)                 as imported_created,
  count(*) filter (where not o.created_by_import)             as imported_matched,
  count(*) filter (where o.has_account)                       as signed_up,
  count(*) filter (where o.has_account
                     and o.account_linked_at <= o.imported_at) as signed_up_before_import,
  (select count(*)
     from public.customer_import_batches b
    where b.applied_at is not null)                           as batches_applied,
  count(*) filter (where o.claim_link_first_clicked_at is not null) as clicked,
  -- PRD-loyalty-points slice 06: the Claim bonus, and what points did.
  count(*) filter (where o.claim_bonus_at is not null)        as claim_bonuses,
  (select coalesce(sum(ord.points_spent), 0)
     from public.orders ord
     join public.migrated_customers mc on mc.customer_id = ord.customer_id
    where ord.points_spent > 0
      and ord.paid_at is not null)::bigint                    as migrated_points_spent,
  (select count(*)
     from public.orders ord
     join public.migrated_customers mc on mc.customer_id = ord.customer_id
    where ord.points_spent > 0
      and ord.paid_at is not null)                            as points_orders,
  (select coalesce(sum(ord.total), 0)
     from public.orders ord
     join public.migrated_customers mc on mc.customer_id = ord.customer_id
    where ord.points_spent > 0
      and ord.paid_at is not null)                            as points_revenue,
  -- Migration 08 (20261020200700): the campaign.
  count(*) filter (where o.last_campaign_sent_at is not null) as emailed,
  (select count(distinct cs.customer_id)
     from public.customer_campaign_sends cs
     join public.migrated_customers mc on mc.customer_id = cs.customer_id
    where cs.bounced_at is not null)                          as emails_bounced,
  (select count(distinct cs.customer_id)
     from public.customer_campaign_sends cs
     join public.migrated_customers mc on mc.customer_id = cs.customer_id
    where cs.complained_at is not null)                       as emails_complained
from public.admin_customer_overview o
where o.from_shopify;

-- ---------------------------------------------------------------------
-- 3e. Their privileges: exactly what the old views held, then the rule
-- ---------------------------------------------------------------------
do $$
declare
  g record;
begin
  -- A new view starts with the schema's default privileges. Clear every
  -- grantee but the owner, so the views end up holding what they held.
  for g in
    select distinct c.relname::text as view_name,
           case when a.grantee = 0 then 'public' else quote_ident(pg_get_userbyid(a.grantee)) end as grantee
      from pg_class c
     cross join lateral aclexplode(c.relacl) a
     where c.oid in ('public.admin_customer_overview'::regclass, 'public.admin_customer_migration_summary'::regclass)
       and a.grantee <> c.relowner
  loop
    execute format('revoke all on public.%I from %s', g.view_name, g.grantee);
  end loop;

  for g in select * from pg_temp.retired_voucher_view_acl loop
    if g.column_name is null then
      execute format('grant %s on public.%I to %s%s', g.privilege_type, g.view_name, g.grantee,
                     case when g.is_grantable then ' with grant option' else '' end);
    elsif exists (select 1 from pg_attribute
                   where attrelid = format('public.%I', g.view_name)::regclass
                     and attname = g.column_name and attnum > 0 and not attisdropped) then
      -- A column that no longer exists (welcome_voucher_state) has nothing to carry.
      execute format('grant %s (%I) on public.%I to %s%s', g.privilege_type, g.column_name, g.view_name, g.grantee,
                     case when g.is_grantable then ' with grant option' else '' end);
    end if;
  end loop;
end $$;

drop table if exists pg_temp.retired_voucher_view_acl;

-- Server-only, as every definition before: read with the service role after
-- the `customers` permission check.
revoke all on public.admin_customer_overview from anon, authenticated;
grant select on public.admin_customer_overview to service_role;

revoke all on public.admin_customer_migration_summary from anon, authenticated;
grant select on public.admin_customer_migration_summary to service_role;
