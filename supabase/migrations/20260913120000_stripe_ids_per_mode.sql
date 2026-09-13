-- Stripe object ids are per-ACCOUNT, so one column cannot hold both modes.
--
-- `products.stripe_product_id` and `product_variants.stripe_price_id` were single
-- columns. A Stripe Product created in the sandbox does not exist in the live
-- account and vice versa, so pointing the sync at a live key overwrote the sandbox
-- mapping, and pointing it back recreated sandbox products beside the originals.
-- The two modes could never be valid at the same time -- which is exactly what
-- "sandbox on localhost, live on Vercel" needs, since both share ONE database.
--
-- The existing columns become the LIVE ids; `_test` holds the sandbox ones.
-- `lib/stripe/mode.ts` picks between them from the key prefix, so an environment
-- reads whichever account its own key points at.
--
-- Nothing is nulled here. Everything currently stored was created against the
-- sandbox (acct_1UEocJFmfnDU9wZa) and is COPIED into the `_test` columns, leaving
-- the originals in place, so this migration is safe to apply BEFORE the code that
-- understands it ships: today's deployed code keeps reading the column it always
-- read, and keeps finding the sandbox id it always found.
--
-- The live columns therefore hold sandbox ids until the first live sync. That is
-- self-healing rather than dangerous: `syncProductToStripe` already drops an id the
-- account has never heard of (`resource_missing`) and creates fresh. Run
-- `npm run stripe:sync-all -- --live` BEFORE putting live keys into Vercel and the
-- window never opens.

alter table products add column if not exists stripe_product_id_test text;
alter table product_variants add column if not exists stripe_price_id_test text;

comment on column products.stripe_product_id is
  'Stripe Product id in the LIVE account. See stripe_product_id_test for sandbox.';
comment on column products.stripe_product_id_test is
  'Stripe Product id in the TEST/sandbox account. Selected by lib/stripe/mode.ts.';
comment on column product_variants.stripe_price_id is
  'Stripe Price id in the LIVE account. See stripe_price_id_test for sandbox.';
comment on column product_variants.stripe_price_id_test is
  'Stripe Price id in the TEST/sandbox account. Selected by lib/stripe/mode.ts.';

update products
   set stripe_product_id_test = stripe_product_id
 where stripe_product_id is not null
   and stripe_product_id_test is null;

update product_variants
   set stripe_price_id_test = stripe_price_id
 where stripe_price_id is not null
   and stripe_price_id_test is null;
