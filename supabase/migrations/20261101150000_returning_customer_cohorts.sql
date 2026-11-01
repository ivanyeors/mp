-- The retention scorecard's headline (PRD-crm-retention-loop slice 06): the
-- **Returning customer rate** by first-purchase month
-- (lifecycle-and-metrics.md, "The headline"). Of the Customers whose first
-- **Purchase** was in a month, how many came back within 12 months, for an
-- attended re-adjustment or for a second Purchase.
--
-- A Purchase is what the Customer overview counts (`pu`, 20261031152806): a
-- paid Order, not pending, cancelled, refunded or payment-failed, with at
-- least one goods line, so a re-adjustment fee is never one and a refunded
-- Order was not kept. Coming back is, within 12 months after the first
-- Purchase (strictly after it, up to and including 12 calendar months later):
--   - via_purchase      another Purchase;
--   - via_readjustment  a Re-adjustment booking attended;
--   - came_back         either (a Customer with both counts once).
-- Months are Singapore's. Purchases on this site only: Shopify-era orders
-- join once retention slice 09 imports them, and the card says so.
--
-- Every count, never a rate: the card writes the rate, and only for a cohort
-- whose 12 months are over and that holds 20 or more people.
--
-- A function, not a view, so nothing depends on the overview's shape (as
-- admin_customer_lifecycle_counts, 20261101020836). Server-only: execute for
-- the service role alone; the caller has checked `customers`. Idempotent.

create or replace function public.admin_returning_customer_cohorts()
returns table (cohort_month date, first_buyers int, came_back int, via_readjustment int, via_purchase int)
language sql
stable
set search_path = ''
as $$
  with purchase as (
    select o.customer_id, o.paid_at
      from public.orders o
     where o.customer_id is not null
       and o.paid_at is not null
       and o.status not in ('pending', 'cancelled', 'refunded', 'payment_failed')
       and exists (select 1 from public.order_items i where i.order_id = o.id and i.kind = 'goods')
  ),
  firsts as (
    select p.customer_id, min(p.paid_at) as first_at
      from purchase p
     group by p.customer_id
  ),
  back as (
    select f.first_at,
           exists (
             select 1 from purchase p
              where p.customer_id = f.customer_id
                and p.paid_at > f.first_at
                and p.paid_at <= f.first_at + interval '12 months'
           ) as bought_again,
           exists (
             select 1 from public.readjustment_bookings b
              where b.customer_id = f.customer_id
                and b.status = 'attended'
                and b.start_at > f.first_at
                and b.start_at <= f.first_at + interval '12 months'
           ) as readjusted
      from firsts f
  )
  select (date_trunc('month', b.first_at at time zone 'Asia/Singapore'))::date as cohort_month,
         count(*)::int                                                  as first_buyers,
         count(*) filter (where b.bought_again or b.readjusted)::int     as came_back,
         count(*) filter (where b.readjusted)::int                       as via_readjustment,
         count(*) filter (where b.bought_again)::int                     as via_purchase
    from back b
   group by 1
   order by 1
$$;

revoke execute on function public.admin_returning_customer_cohorts() from public, anon, authenticated;
grant execute on function public.admin_returning_customer_cohorts() to service_role;
