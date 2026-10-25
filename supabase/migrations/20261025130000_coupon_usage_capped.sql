-- Coupon usage that cannot pass its limit (prod hardening slice 09 item 4).
--
-- increment_coupon_usage() added one unconditionally, so two orders paid with
-- a usage_limit = 1 code both counted and the limit read 2 of 1. Checkout
-- checks the limit before payment; the count happens after it, when it is too
-- late to refuse. These two functions make the count itself honest:
--
-- increment_coupon_usage_capped(): adds one only while usage_count is under
-- usage_limit (or there is no limit) and returns whether it did. False means
-- this order redeemed a code that was already used up; the caller flags the
-- order for Staff.
--
-- decrement_coupon_usage(): takes one back on a full refund, never below zero,
-- in one statement (the webhook read the count and wrote it back, losing a
-- decrement when two refunds landed together).
--
-- Server-only: executable by service_role alone. Idempotent.

create or replace function public.increment_coupon_usage_capped(p_coupon_id uuid)
returns boolean
language sql
set search_path = public
as $$
  with bumped as (
    update coupons
       set usage_count = usage_count + 1
     where id = p_coupon_id
       and (usage_limit is null or usage_count < usage_limit)
    returning 1
  )
  select exists (select 1 from bumped);
$$;

create or replace function public.decrement_coupon_usage(p_coupon_id uuid)
returns void
language sql
set search_path = public
as $$
  update coupons set usage_count = greatest(usage_count - 1, 0) where id = p_coupon_id;
$$;

revoke all on function public.increment_coupon_usage_capped(uuid) from public, anon, authenticated;
revoke all on function public.decrement_coupon_usage(uuid) from public, anon, authenticated;
grant execute on function public.increment_coupon_usage_capped(uuid) to service_role;
grant execute on function public.decrement_coupon_usage(uuid) to service_role;

-- The old unconditional increment stays for any caller not yet deployed, but
-- no client role may call it.
revoke all on function public.increment_coupon_usage(uuid) from public, anon, authenticated;
grant execute on function public.increment_coupon_usage(uuid) to service_role;
