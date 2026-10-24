-- Discount codes on customisations (ADR 0033).
--
-- The customisation contact step and shop checkout now take one optional code:
-- a partner's referral code or a discount code. A discount code on a Result is
-- checked once, at hold, against the coupon as it is then, and the Result keeps
-- the coupon's terms. Every later repricing (assign, the status page,
-- request-payment, finish, reconfigure, Accept) takes those terms off the goods
-- it prices, so the discount follows the build Staff assign, and an edit to the
-- coupon afterwards never moves a price the customer already authorised.
--
--   coupon_id     the coupon, for the Order made at Accept and for counting
--                 the code's uses while the Result is live (a held Result
--                 holds a use, or one limited code could be held without end)
--   coupon_code   the code as the customer entered it, upper-cased
--   coupon_terms  {discount_type, discount_value, max_discount} at hold
--
-- On a Paired build only the Mpillow (the anchor) carries the code; its
-- Mbolster leaves all three null.
--
-- DEPLOY ORDER: apply BEFORE the code that ships with it. That code selects and
-- writes these columns on every hold and every repricing, so against the old
-- schema each of them fails. The columns on their own change nothing: old code
-- never reads them.

alter table mp_config_responses
  add column if not exists coupon_id uuid references coupons(id) on delete set null,
  add column if not exists coupon_code text,
  add column if not exists coupon_terms jsonb;

alter table mp_config_responses
  drop constraint if exists mp_config_responses_coupon_terms_shape;
alter table mp_config_responses
  add constraint mp_config_responses_coupon_terms_shape check (
    coupon_terms is null or (
      jsonb_typeof(coupon_terms) = 'object'
      and coupon_terms->>'discount_type' in ('percentage', 'fixed_amount', 'free_shipping')
      and jsonb_typeof(coupon_terms->'discount_value') = 'number'
      and (coupon_terms->>'discount_value')::numeric >= 0
      and (
        coupon_terms->>'discount_type' <> 'percentage'
        or (coupon_terms->>'discount_value')::numeric <= 100
      )
    )
  );

-- The live-use count reads Results by coupon (lib/ecommerce/discounts.ts).
create index if not exists idx_mp_config_responses_coupon
  on mp_config_responses (coupon_id)
  where coupon_id is not null;

comment on column mp_config_responses.coupon_id is
  'Discount code this Result was held with (ADR 0033). Null on a Paired build''s Mbolster: the Mpillow carries the code.';
comment on column mp_config_responses.coupon_code is
  'The discount code as entered at hold, upper-cased.';
comment on column mp_config_responses.coupon_terms is
  'The coupon''s {discount_type, discount_value, max_discount} at hold. Every repricing takes them off the goods; never re-read from coupons.';

-- Coupon codes are bearer credentials. Only server code reads them, through the
-- service role (20260902000000 already scoped the table's policy to it); the
-- leftover grants to the API roles go too, as for the other server-only tables
-- in 20260917033807.
revoke all on public.coupons from anon, authenticated;
-- Security invoker, so RLS already stops anon; nothing but the server calls it.
revoke execute on function public.increment_coupon_usage(uuid) from public, anon, authenticated;
grant execute on function public.increment_coupon_usage(uuid) to service_role;
