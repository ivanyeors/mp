-- Dimension override tables are server-only (Oct 2026 security review).
--
-- 20260925090000_dimension_overrides created filling_dimension_overrides and
-- neck_support_dimension_overrides with "Service role full access" policies
-- that carry no TO clause, so they apply to `public` — anon included. With the
-- default table grants, anyone holding the public anon key could insert, update
-- or delete these rows over PostgREST. They feed the size recommendation
-- (app/api/mp-basic/recommend, app/api/shop/customize) and the configurator.
--
-- 20260902000000 fixed every policy of this shape that existed then, but its
-- sweep ran once, before these two tables existed.
--
-- Every reader and writer is server code using the service role (the routes
-- above, lib/spatial-fillings/dimension-overrides.server.ts and the Settings
-- dimensions route), which bypasses RLS and needs no grant. So:
--   1. re-run the 20260902000000 sweep, catching these two and any other
--      "Service role full access" policy still scoped to public,
--   2. revoke the client-role grants on both tables — same shape as
--      20261002000000_analytics_tables_server_only.sql.
-- Idempotent.

do $$
declare
  p record;
begin
  for p in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and policyname like 'Service role full access%'
      and roles = '{public}'
  loop
    execute format('alter policy %I on public.%I to service_role', p.policyname, p.tablename);
  end loop;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'filling_dimension_overrides', 'neck_support_dimension_overrides'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;
