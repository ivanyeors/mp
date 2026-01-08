-- Add compare-at pricing to costings tables (used for Shopify compare_at_price sync)

alter table if exists item_prices
  add column if not exists compare_at_price numeric(12,2)
    check (compare_at_price is null or compare_at_price >= 0);

comment on column item_prices.compare_at_price is 'Optional retail compare-at price (for strikethrough pricing)';

alter table if exists product_prices
  add column if not exists compare_at_price numeric(12,2)
    check (compare_at_price is null or compare_at_price >= 0);

comment on column product_prices.compare_at_price is 'Optional retail compare-at price (for strikethrough pricing)';

