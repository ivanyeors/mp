-- The Customer lifecycle chart on the Customers page (owner, 2026-10-31):
-- how many Customers are in each **Lifecycle stage** now, by sub-status, and
-- how many of them are placed by their Shopify-era order count alone (*no
-- dates yet*). CONTEXT.md **Lifecycle stage**; PRD-crm-retention-loop slice 03.
--
-- One row per (stage, sub-status, no dates yet) that has Customers, counted
-- from the Customer overview, so the chart and the list's *Stage* filter
-- always agree: the overview is the only place the stage is computed
-- (customer_lifecycle_stage and customer_lifecycle_detail, with now()).
--
-- A function rather than a view: a view that reads the overview would have to
-- be dropped and created again by every rebuild of the overview (Postgres
-- refuses to drop a view another view reads), as the Migration card's summary
-- is. A SQL function's body is not a dependency, so the overview stays free
-- to change; lib/crm/__tests__/lifecycle-counts-sql.test.ts holds the columns
-- it reads to the overview's.
--
-- Server-only: execute for the service role alone, as the lifecycle
-- functions. It runs as the invoker, and only the service role reads the
-- overview. Idempotent.

create or replace function public.admin_customer_lifecycle_counts()
returns table (stage text, detail text, undated boolean, customers int)
language sql
stable
set search_path = ''
as $$
  select ov.lifecycle_stage   as stage,
         ov.lifecycle_detail  as detail,
         ov.lifecycle_undated as undated,
         count(*)::int        as customers
    from public.admin_customer_overview ov
   group by ov.lifecycle_stage, ov.lifecycle_detail, ov.lifecycle_undated
$$;

revoke execute on function public.admin_customer_lifecycle_counts() from public, anon, authenticated;
grant execute on function public.admin_customer_lifecycle_counts() to service_role;
