-- Revoke public access to Sizing photos (mp_config_response_photos).
--
-- 0024 created this table with four wide-open policies — select, insert, update
-- and delete, each `using (true)`. The 2026-09-02 hardening pass dropped exactly
-- this set for mp_config_responses, mp_maker_configs and mp_staff, and skipped
-- this table. Because NEXT_PUBLIC_SUPABASE_ANON_KEY ships inside the browser
-- bundle, the customers' front/side body photos were listable, alterable and
-- deletable straight through PostgREST without touching a route.
--
-- Every reader in the codebase goes through supabaseAdmin() (service role):
--   app/api/mp-config/photos/route.ts        (upsert)
--   app/api/mp-config/responses/route.ts     (Telegram attachment)
-- No browser-side Supabase client touches this table, so revoking the anon
-- grants breaks nothing.

drop policy if exists "Public delete mp-config response photos" on public.mp_config_response_photos;
drop policy if exists "Public read mp-config response photos"   on public.mp_config_response_photos;
drop policy if exists "Public update mp-config response photos" on public.mp_config_response_photos;
drop policy if exists "Public write mp-config response photos"  on public.mp_config_response_photos;

-- RLS stays enabled (0024 enabled it); with no anon/authenticated policies the
-- table is now deny-by-default for every role except service_role.
alter table public.mp_config_response_photos enable row level security;

-- Explicit service-role policy so intent is visible in the dashboard, matching
-- the shape used by 20260902000000_rls_hardening_and_hot_path_indexes.sql.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'mp_config_response_photos'
      and policyname = 'Service role full access mp_config_response_photos'
  ) then
    create policy "Service role full access mp_config_response_photos"
      on public.mp_config_response_photos
      for all to service_role using (true) with check (true);
  end if;
end $$;
