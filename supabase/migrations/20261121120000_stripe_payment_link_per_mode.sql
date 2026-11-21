-- A product's Stripe payment link is per-ACCOUNT, like its Product and Price ids.
--
-- `products.stripe_payment_link` / `stripe_payment_link_id` were single columns while
-- localhost (sandbox) and Vercel (live) share ONE database. Generating a link in one
-- mode overwrote the other mode's link and left it active in Stripe with no row
-- pointing at it (see 20260913120000_stripe_ids_per_mode.sql for the ids).
--
-- The existing columns become the LIVE link; `_test` holds the sandbox one.
-- `lib/stripe/mode.ts` picks between them from the key prefix.
--
-- Safe to apply before or after the code that reads `_test` ships:
--   * Before: the deployed code only reads and writes the live columns. Live mode
--     keeps its live link untouched. The only rows changed are those whose live
--     columns hold a sandbox URL (https://buy.stripe.com/test_...), which the live
--     site should never have shown; old code on localhost stops seeing that sandbox
--     link and a regenerate there leaves the old sandbox link active in the sandbox
--     (no real money).
--   * After: the new code refuses to generate a test-mode link until `_test`
--     exists (it checks before calling Stripe), and live mode reads the same live
--     columns as before. A sandbox link still sitting in the live columns is
--     cleared by the live sync (`resource_missing`) with a notice; this migration
--     moves it to `_test` first so the sandbox keeps it.
--
-- Rows whose URL does not start with https://buy.stripe.com/test_ are left alone.

alter table products add column if not exists stripe_payment_link_test text;
alter table products add column if not exists stripe_payment_link_id_test text;

comment on column products.stripe_payment_link is
  'Stripe payment link URL in the LIVE account. See stripe_payment_link_test for sandbox.';
comment on column products.stripe_payment_link_id is
  'Stripe payment link id in the LIVE account. See stripe_payment_link_id_test for sandbox.';
comment on column products.stripe_payment_link_test is
  'Stripe payment link URL in the TEST/sandbox account. Selected by lib/stripe/mode.ts.';
comment on column products.stripe_payment_link_id_test is
  'Stripe payment link id in the TEST/sandbox account. Selected by lib/stripe/mode.ts.';

update products
   set stripe_payment_link_test = stripe_payment_link,
       stripe_payment_link_id_test = stripe_payment_link_id
 where stripe_payment_link like 'https://buy.stripe.com/test\_%' escape '\'
   and stripe_payment_link_test is null
   and stripe_payment_link_id_test is null;

update products
   set stripe_payment_link = null,
       stripe_payment_link_id = null
 where stripe_payment_link like 'https://buy.stripe.com/test\_%' escape '\'
   and stripe_payment_link_test = stripe_payment_link;
