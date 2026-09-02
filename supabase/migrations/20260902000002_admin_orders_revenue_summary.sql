-- Orders dashboard revenue aggregate as an RPC.
--
-- PostgREST aggregate functions (`total.sum()`) are disabled on this project
-- (pgrst.db_aggregates_enabled is unset on the authenticator role), so the
-- dashboard computes revenue and order count through this function instead
-- of fetching every order row into the route handler.
--
-- Mirrors lib/ecommerce/orders-paid-at-range.ts: an open bound means no
-- filter on that side, and rows without paid_at are only included when the
-- lower bound is open. Service role only.

create or replace function public.admin_orders_revenue_summary(
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (revenue_sum numeric, revenue_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select
    coalesce(sum(o.total), 0)::numeric as revenue_sum,
    count(*)::bigint as revenue_count
  from public.orders o
  where o.status not in ('cancelled', 'refunded')
    and (p_from is null or o.paid_at >= p_from)
    and (p_to is null or o.paid_at < p_to);
$$;

revoke all on function public.admin_orders_revenue_summary(timestamptz, timestamptz) from public;
revoke all on function public.admin_orders_revenue_summary(timestamptz, timestamptz) from anon;
revoke all on function public.admin_orders_revenue_summary(timestamptz, timestamptz) from authenticated;
grant execute on function public.admin_orders_revenue_summary(timestamptz, timestamptz) to service_role;
