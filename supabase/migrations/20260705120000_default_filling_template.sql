-- Per product card Default Filling Template (ADR 0003).
-- Pillow: one nullable default per size×tier on pillow_products.
-- Bolster: one nullable default per length on bolster_length_config.

alter table pillow_products
  add column if not exists default_filling_template_id bigint
    references bom_templates(id) on delete set null;

create index if not exists idx_pillow_products_default_filling_template
  on pillow_products (default_filling_template_id)
  where default_filling_template_id is not null;

create table if not exists bolster_length_config (
  variant text primary key check (variant in ('short', 'medium', 'long')),
  default_filling_template_id bigint references bom_templates(id) on delete set null,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_bolster_length_config_updated_at on bolster_length_config;
create trigger trg_bolster_length_config_updated_at
before update on bolster_length_config
for each row execute procedure set_updated_at();

insert into bolster_length_config (variant)
values ('short'), ('medium'), ('long')
on conflict (variant) do nothing;
