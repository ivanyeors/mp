-- Slice 04: add price_key to product_variants.
-- Provides an explicit costing link from a storefront variant to a
-- product_prices.key entry, resolving ambiguity for premium fabric variants
-- (linen/fibrecool) that share a pillow_product_id but need distinct MSRPs.
-- Nullable: standard pillow variants resolve via pillow_product_id; bolster
-- variants get price_key = 'product:bolster:{short|medium|long}' set by
-- inventory-sync.
alter table product_variants add column if not exists price_key text;
comment on column product_variants.price_key is
  'Explicit link to product_prices.key; overrides pillow_product_id / option1 resolution when set';

-- down: alter table product_variants drop column if exists price_key;
