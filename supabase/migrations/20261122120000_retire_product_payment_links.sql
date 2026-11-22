-- Retire products' Stripe payment links (buy.stripe.com). ADR 0048, amended 2026-11-22.
--
-- A sale through one took the money and made no Order: its Checkout Session carried no
-- order_id, so the webhook stopped there, and the link itself collected no delivery
-- address, charged no shipping or tax and checked no stock. The product editor no longer
-- makes them. A shop sale goes through the shop checkout; a sale Staff arrange goes
-- through a Staff order's own Payment link.
--
-- Read on 2026-11-22 before writing this: all four columns were null on every row, no
-- view or function reads them, and the live Stripe account had never had a payment link.
-- Nothing is lost.
--
-- The owner applies this (Claude may not drop columns). Apply it after promoting the
-- build that removes the Generate link button: until then an older build can still
-- write these columns.

alter table products
  drop column if exists stripe_payment_link,
  drop column if exists stripe_payment_link_id,
  drop column if exists stripe_payment_link_test,
  drop column if exists stripe_payment_link_id_test;
