-- Product pricing for pillow and bolster catalog entries
create table if not exists product_prices (
  key text primary key,
  kind text not null check (kind in ('pillow','bolster')),
  product_id bigint references pillow_products(id) on delete cascade,
  variant text,
  msrp numeric(12,2) check (msrp is null or msrp >= 0),
  currency text not null default 'USD',
  updated_at timestamptz not null default now(),
  check (
    (kind = 'pillow' and product_id is not null and variant is null)
    or (kind = 'bolster' and product_id is null and variant in ('short','medium','long'))
  )
);

create index if not exists idx_product_prices_kind on product_prices (kind);
create index if not exists idx_product_prices_product on product_prices (product_id) where kind = 'pillow';
create index if not exists idx_product_prices_variant on product_prices (variant) where kind = 'bolster';

drop trigger if exists trg_product_prices_updated_at on product_prices;
create trigger trg_product_prices_updated_at
before update on product_prices
for each row execute procedure set_updated_at();


