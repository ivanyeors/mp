-- Extend customization_configs for bolster products (#43).
-- Pillows keep pillow_product_id; bolsters use bolster_variant + ecom_product_id.

alter table customization_configs
  add column if not exists product_type text not null default 'pillow'
    check (product_type in ('pillow', 'bolster'));

alter table customization_configs
  alter column pillow_product_id drop not null;

alter table customization_configs
  add column if not exists bolster_variant text
    check (bolster_variant in ('short', 'medium', 'long'));

alter table customization_configs
  add column if not exists ecom_product_id uuid references products(id) on delete set null;

alter table customization_configs
  drop constraint if exists customization_configs_product_type_fields;

alter table customization_configs
  add constraint customization_configs_product_type_fields check (
    (product_type = 'pillow' and pillow_product_id is not null)
    or
    (product_type = 'bolster' and bolster_variant is not null)
  );

create index if not exists idx_customization_configs_bolster
  on customization_configs(product_type, bolster_variant);
