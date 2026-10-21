-- The Welcome-back voucher's state, and what the vouchers cost
-- (PRD-shopify-customer-migration slice 06; ADR 0028 (k)).
--
-- welcome_voucher_state(usage_count, is_active, expires_at) is the one rule for
-- a voucher's state, derived from the coupon's own facts and never stored:
--   used     redeemed: usage_count moves when the Order is paid (Stripe webhook)
--   expired  unused, and past its expiry or switched off in Discounts: it can
--            no longer be used
--   issued   unused and still usable
-- It returns null for no voucher (usage_count null, from a left join); the
-- Customer overview shows that as 'none'. The customer's own pages apply the
-- same rule in TypeScript (welcomeVoucherState, lib/customer-migration/
-- welcome-voucher.ts), and the slice 06 SQL assert checks the two agree.
--
-- admin_welcome_voucher_summary: one row, the Discounts page's Welcome-back
-- voucher card. Each voucher is valued at its own discount_value, so a change
-- of terms never re-values vouchers already issued.
--   value_outstanding  the live liability: issued, unused, still usable
--   value_issued       every voucher at face value, the most they could cost
--   value_redeemed     the realised cost: redeemed × value
-- Only a fixed amount has a value. A free-shipping voucher is counted, and
-- its cost is the shipping it waives, which the Order does not record as a
-- discount; free_shipping says how many there are.
-- Server-only, like the Customer overview: security_invoker, revoked from
-- anon and authenticated; read with the service role after `discounts`.
--
-- Idempotent.

create or replace function public.welcome_voucher_state(
  p_usage_count int,
  p_is_active boolean,
  p_expires_at timestamptz
)
returns text
language sql
stable
set search_path = public
as $$
  select case
           when p_usage_count is null then null
           when p_usage_count > 0 then 'used'
           when not coalesce(p_is_active, false) or p_expires_at <= now() then 'expired'
           else 'issued'
         end;
$$;

revoke execute on function public.welcome_voucher_state(int, boolean, timestamptz) from public, anon, authenticated;
grant execute on function public.welcome_voucher_state(int, boolean, timestamptz) to service_role;

create or replace view public.admin_welcome_voucher_summary with (security_invoker = true) as
select
  count(*)                                                  as issued,
  count(*) filter (where s.state = 'used')                  as redeemed,
  count(*) filter (where s.state = 'issued')                as outstanding,
  count(*) filter (where s.state = 'expired')               as expired,
  count(*) filter (where c.discount_type = 'free_shipping') as free_shipping,
  coalesce(sum(c.discount_value) filter (where c.discount_type = 'fixed_amount'), 0)
                                                            as value_issued,
  coalesce(sum(c.discount_value) filter (where c.discount_type = 'fixed_amount'
                                           and s.state = 'issued'), 0)
                                                            as value_outstanding,
  coalesce(sum(c.discount_value) filter (where c.discount_type = 'fixed_amount'
                                           and s.state = 'used'), 0)
                                                            as value_redeemed
from public.coupons c
cross join lateral (
  select public.welcome_voucher_state(c.usage_count, c.is_active, c.expires_at) as state
) s
where c.issued_for = 'welcome_back';

revoke all on public.admin_welcome_voucher_summary from anon, authenticated;
