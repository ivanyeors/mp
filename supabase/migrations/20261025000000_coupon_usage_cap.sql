-- Coupon usage must be capped in the SAME statement that increments it
-- (prod-hardening slice 09). The previous definition
-- (20260702130000_increment_coupon_usage.sql) bumped usage_count
-- unconditionally, so two checkouts that each passed the pre-payment usage
-- check in checkCoupon() could both redeem a single-use code: the limit was
-- read at validation but enforced nowhere at increment. Gate the increment on
-- the limit and report whether it applied. The caller records an Order timeline
-- note when it did not — payment is already captured by then, so this never
-- blocks the webhook or the capture.
--
-- The return type changes (void -> integer), which create-or-replace cannot do,
-- so drop and recreate. The drop also drops the grants and search_path that
-- 20261024150000 and 20260917033807 set, so both are re-established here.
drop function if exists public.increment_coupon_usage(uuid);

-- Security invoker (the default): only the service role calls it, and the
-- coupons table's RLS already stops anon/authenticated. search_path is pinned
-- per the security advisor (20260917033807).
create function public.increment_coupon_usage(coupon_id uuid)
returns integer
language sql
set search_path = public
as $$
  update coupons set usage_count = usage_count + 1
  where id = coupon_id and (usage_limit is null or usage_count < usage_limit)
  returning usage_count;
$$;

revoke execute on function public.increment_coupon_usage(uuid) from public, anon, authenticated;
grant execute on function public.increment_coupon_usage(uuid) to service_role;
