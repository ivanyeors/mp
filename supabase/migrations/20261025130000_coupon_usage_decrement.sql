-- Take a coupon redemption back atomically (pre-launch hardening, 2026-10-25).
--
-- On a full refund the Stripe webhook gave a coupon's use back by reading
-- usage_count and writing it back less one, so two refunds landing together
-- lost a decrement, and a database error went unnoticed.
--
-- decrement_coupon_usage(): one statement, never below zero. Its counterpart,
-- the capped increment, is increment_coupon_usage (20261025000000), which
-- adds one only while usage_count is under usage_limit.
--
-- Server-only: executable by service_role alone. Idempotent.

create or replace function public.decrement_coupon_usage(p_coupon_id uuid)
returns void
language sql
set search_path = public
as $$
  update coupons set usage_count = greatest(usage_count - 1, 0) where id = p_coupon_id;
$$;

revoke all on function public.decrement_coupon_usage(uuid) from public, anon, authenticated;
grant execute on function public.decrement_coupon_usage(uuid) to service_role;
