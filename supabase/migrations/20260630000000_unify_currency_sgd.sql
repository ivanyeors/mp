-- Slice 03: unify currency on SGD.
-- Migration 0031 already relabelled the MYR-defaulted storefront tables
-- (product_variants, carts, shipping_methods, coupons, orders). This finishes
-- the job for the USD-defaulted costings/pricing tables.
--
-- DECISION: relabel, not FX-convert. The recorded base currency is SGD; the
-- 'USD' defaults were placeholders, so stored amounts are treated as already
-- being SGD figures (see money-flow-traceability PRD). If genuine USD values
-- ever need an FX multiply, do it as a separate, audited one-off before relying
-- on these columns.
--
-- REVERSIBILITY: a relabel is reversed by flipping the defaults/values back to
-- 'USD' (down migration below, kept commented). No amounts are mutated, so this
-- is information-preserving.

-- item_prices (cost_price + msrp, per-item costings)
alter table item_prices alter column currency set default 'SGD';
update item_prices set currency = 'SGD' where currency in ('USD', 'MYR');
comment on column item_prices.cost_price is 'Internal cost price in SGD';
comment on column item_prices.msrp is 'Retail price in SGD';
comment on column item_prices.currency is 'ISO currency code, defaults to SGD';

-- product_prices (catalog MSRP for pillow/bolster entries)
alter table product_prices alter column currency set default 'SGD';
update product_prices set currency = 'SGD' where currency in ('USD', 'MYR');

-- shopify_variant_overrides already defaults to SGD (migration 0017); re-assert
-- and sweep any stray non-SGD rows for completeness.
alter table shopify_variant_overrides alter column currency set default 'SGD';
update shopify_variant_overrides set currency = 'SGD' where currency <> 'SGD';

-- Down (manual):
--   alter table item_prices alter column currency set default 'USD';
--   alter table product_prices alter column currency set default 'USD';
