-- First-party analytics tables are server-only (Oct 2026).
--
-- analytics_visitors holds emails; analytics_visits / analytics_events hold
-- browsing history. Every reader and writer is server code using the service
-- role (app/api/analytics/ingest, the analytics admin actions, results hold,
-- referrals), which bypasses RLS and needs no grant.
--
-- 20260902000000 already scoped their "Service role full access" policies to
-- service_role, so RLS should deny anon today. What remained, confirmed on the
-- live project on 2026-10-02: anon and authenticated still held every table
-- privilege (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, ...). That is one
-- permissive policy or one RLS toggle away from an exposure, so:
--   1. re-assert the policy scoping (no-op if already applied),
--   2. revoke the client-role grants — same shape as
--      20260917033807_security_advisor_hardening.sql section 3.
-- Idempotent.

do $$
declare
  t text;
begin
  foreach t in array array[
    'analytics_visitors', 'analytics_visits', 'analytics_events', 'analytics_ga_events'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security', t);
      if exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = t
          and policyname = 'Service role full access ' || t
      ) then
        execute format('alter policy %I on public.%I to service_role', 'Service role full access ' || t, t);
      end if;
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;
