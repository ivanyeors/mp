-- ============================================================
-- DISABLE GST UNTIL REGISTERED
-- ============================================================
-- Mellow Life is not GST-registered (no GST registration number), so the
-- storefront must NOT charge GST. The original seed (0036_tax_rates.sql) set
-- SG GST to 9%; zero it here.
--
-- The row is kept ACTIVE (not deleted) on purpose: an active SG rule means the
-- DB-backed loader returns it, so the hardcoded 9% fallback in
-- lib/ecommerce/tax.ts (DEFAULT_TAX_RULES) never re-applies if the table is read.
-- With rate = 0, computeTax() returns 0 and no tax line item is added.
--
-- REVERSAL (once GST-registered): set rate back to 0.09, add the SG tax
-- registration in Stripe (Dashboard or `stripe post /v1/tax/registrations`),
-- and set STRIPE_AUTOMATIC_TAX=true to let Stripe Tax compute it.
-- Guarded: the live project may not have the tax_rates table (0036 unapplied),
-- in which case the code default (now empty) already yields no tax.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'tax_rates'
  ) then
    update tax_rates set rate = 0 where upper(region) = 'SG';
  end if;
end $$;
