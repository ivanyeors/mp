-- Drops the six-stage Lifecycle stage functions of
-- 20261028033330_lifecycle_stage.sql:
--   customer_lifecycle_stage(int, timestamptz, timestamptz)
--   customer_lifecycle_delivery(int, timestamptz, timestamptz, timestamptz)
-- Nothing calls them since 20261028084009_lifecycle_funnel.sql: the overview
-- calls the functions that replaced them, and no code calls either directly.
--
-- A migration of its own so that the funnel could be applied without it:
-- the Supabase connector asks for a confirmation before a drop, and that
-- confirmation did not reach the owner (2026-10-28).
--
-- Idempotent.

drop function if exists public.customer_lifecycle_delivery(int, timestamptz, timestamptz, timestamptz);
drop function if exists public.customer_lifecycle_stage(int, timestamptz, timestamptz);
