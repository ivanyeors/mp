-- The Migration card becomes a journey (owner, 2026-10-31): one chart of
-- where every Migrated customer is now, instead of seven separate figures.
--
-- Each Migrated customer sits at exactly one **Journey stage**, the furthest
-- they have reached, checked from the top:
--
--   ordered      a paid Order here after their import (`last_paid_at`, the
--                overview's counted Orders: not pending, cancelled, refunded
--                or failed);
--   claim_bonus  granted the Claim bonus;
--   signed_up    has an account;
--   clicked      opened a Claim link;
--   emailed      a campaign email reached the provider for them (the
--                overview's `last_campaign_sent_at`, which *Emailed* counts);
--   imported     none of these yet.
--
-- The stages sum to `imported`. The chart draws everyone who reached a stage
-- (at it, or further) and splits that into who is there now and who went
-- further. Someone who skipped a step, such as signing up without a campaign
-- email, counts as past it; the existing fact columns (`emailed`, `clicked`,
-- `signed_up`, `claim_bonuses`) say how many did the step itself.
--
-- For the three stages before an account, `*_unreachable` counts those no
-- campaign email can reach any more: unsubscribed, or a campaign email of
-- theirs bounced or was marked as spam. That is campaign_send_blocker's
-- `unsubscribed` and `suppressed` (20261020130000), which hold for every
-- template. A Customer who is only not subscribed can still get the service
-- notice, so is not counted.
--
-- Columns are appended; the fourteen before keep their place and
-- expressions. The summary reads the overview through a subquery that adds
-- the stage, so no column of the overview changes.
-- MIGRATION_SUMMARY_COLUMNS (lib/customer-migration/overview.ts) lists the
-- same columns; lib/crm/__tests__/customer-overview-view.test.ts holds them
-- equal, and lib/customer-migration/journey.ts reads them.
--
-- Server-only, as before: security_invoker, read with the service role after
-- the `customers` permission check. Idempotent.

create or replace view public.admin_customer_migration_summary with (security_invoker = true) as
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
  count(*) filter (where o.last_campaign_sent_at is not null) as emailed,
  (select count(distinct cs.customer_id)
     from public.customer_campaign_sends cs
     join public.migrated_customers mc on mc.customer_id = cs.customer_id
    where cs.bounced_at is not null)                          as emails_bounced,
  (select count(distinct cs.customer_id)
     from public.customer_campaign_sends cs
     join public.migrated_customers mc on mc.customer_id = cs.customer_id
    where cs.complained_at is not null)                       as emails_complained,
  -- 2026-10-31: the Journey stage, and who of the first three can't be emailed.
  count(*) filter (where o.journey_stage = 'imported')                      as stage_imported,
  count(*) filter (where o.journey_stage = 'imported' and o.unreachable)    as stage_imported_unreachable,
  count(*) filter (where o.journey_stage = 'emailed')                       as stage_emailed,
  count(*) filter (where o.journey_stage = 'emailed' and o.unreachable)     as stage_emailed_unreachable,
  count(*) filter (where o.journey_stage = 'clicked')                       as stage_clicked,
  count(*) filter (where o.journey_stage = 'clicked' and o.unreachable)     as stage_clicked_unreachable,
  count(*) filter (where o.journey_stage = 'signed_up')                     as stage_signed_up,
  count(*) filter (where o.journey_stage = 'claim_bonus')                   as stage_claim_bonus,
  count(*) filter (where o.journey_stage = 'ordered')                       as stage_ordered
from (
  select ov.created_by_import,
         ov.has_account,
         ov.account_linked_at,
         ov.imported_at,
         ov.claim_link_first_clicked_at,
         ov.claim_bonus_at,
         ov.last_campaign_sent_at,
         case
           when ov.last_paid_at > ov.imported_at            then 'ordered'
           when ov.claim_bonus_at is not null                then 'claim_bonus'
           when ov.has_account                               then 'signed_up'
           when ov.claim_link_first_clicked_at is not null   then 'clicked'
           when ov.last_campaign_sent_at is not null         then 'emailed'
           else                                                   'imported'
         end                                                 as journey_stage,
         (ov.marketing_email = 'unsubscribed'
          or exists (select 1
                       from public.customer_campaign_sends cs
                      where cs.customer_id = ov.id
                        and (cs.bounced_at is not null or cs.complained_at is not null))) as unreachable
    from public.admin_customer_overview ov
   where ov.from_shopify
) o;

revoke all on public.admin_customer_migration_summary from anon, authenticated;
grant select on public.admin_customer_migration_summary to service_role;
