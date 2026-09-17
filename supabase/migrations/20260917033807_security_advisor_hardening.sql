-- Supabase security advisors, worked one at a time.
--
-- Applied to the live project on 2026-09-17; the filename carries the version
-- the remote ledger recorded, so `supabase db push` sees it as already done.
--
-- Written after checking what each advisory actually means here, because two of
-- the four would cause an outage if followed literally.

-- ------------------------------------------------------------------
-- 1. Functions with a mutable search_path (5, all SECURITY INVOKER)
-- ------------------------------------------------------------------
-- Pinned to `public` rather than to '' — three of the five resolve unqualified
-- objects (bom_templates, order_number_seq, coupons) and an empty search_path
-- would break them at the next trigger fire. `public` is also what the two
-- SECURITY DEFINER functions already use, so this matches the database's own
-- convention rather than introducing a second one.

alter function public.set_updated_at() set search_path = public;
alter function public.generate_order_number() set search_path = public;
alter function public.increment_coupon_usage(uuid) set search_path = public;
alter function public.assert_placement_template_is_filling() set search_path = public;
alter function public.reject_partner_payout_update() set search_path = public;

-- ------------------------------------------------------------------
-- 2. SECURITY DEFINER functions reachable over RPC
-- ------------------------------------------------------------------
-- `current_customer_id()` was executable by `anon`, which exposed it at
-- /rest/v1/rpc/current_customer_id. Every one of the 20 RLS policies that call
-- it or `is_admin_user()` applies to `authenticated` only, and no application
-- code calls either over RPC, so anon needs neither.
--
-- `authenticated` KEEPS both, deliberately. The advisor also suggests revoking
-- there or switching to SECURITY INVOKER; doing either would break all 20
-- policies at once — customers could not read their own orders and staff could
-- not read inventory. What the functions return is the caller's own identity,
-- so an authenticated caller invoking one over RPC learns nothing about anyone
-- else.

revoke execute on function public.current_customer_id() from anon;
revoke execute on function public.is_admin_user() from anon;

-- ------------------------------------------------------------------
-- 3. Tables with RLS on and no policies (16)
-- ------------------------------------------------------------------
-- Not the hole it reads as: RLS with zero policies denies every row to every
-- role that does not bypass it, so these are already locked. All 16 are read
-- only by server code through the service role, which bypasses RLS.
--
-- What is worth removing is the leftover grant. It grants nothing today, but it
-- means the day someone adds a permissive policy — or turns RLS off to debug —
-- the door is already open to anon. Belt to go with the braces, in the same
-- shape as 20260902000003.
--
-- This does NOT silence the advisory, which counts policies and not grants.
-- That INFO stays, correctly: these tables have no policies, on purpose.
do $$
declare
  t text;
begin
  foreach t in array array[
    'bolster_template_placements', 'exchange_rates', 'filling_template_placements',
    'item_thresholds', 'landing_page_publishes', 'landing_sections',
    'result_bolster_filling_placements', 'result_filling_placements',
    'shopify_order_lines', 'shopify_order_refunds', 'shopify_orders',
    'shopify_processed_orders', 'shopify_sales_queue', 'shopify_sync_state',
    'shopify_variant_mappings', 'shopify_variant_overrides'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------------
-- 4. Leaked-password protection
-- ------------------------------------------------------------------
-- Not reachable from SQL. It is an Auth setting:
--   Dashboard > Authentication > Policies > "Leaked password protection".
-- Turning it on checks new passwords against HaveIBeenPwned at sign-up and
-- password change.
