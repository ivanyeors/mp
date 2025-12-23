create table if not exists item_prices (
  item_id bigint primary key references items(id) on delete cascade,
  cost_price numeric(12,2) check (cost_price is null or cost_price >= 0),
  msrp numeric(12,2) check (msrp is null or msrp >= 0),
  currency text not null default 'USD',
  updated_at timestamptz not null default now()
);

comment on table item_prices is 'Per-item cost price and MSRP tracking';

comment on column item_prices.cost_price is 'Internal cost price in USD';
comment on column item_prices.msrp is 'Retail price in USD';
comment on column item_prices.currency is 'ISO currency code, defaults to USD';

drop trigger if exists trg_item_prices_updated_at on item_prices;
create trigger trg_item_prices_updated_at
before update on item_prices
for each row execute procedure set_updated_at();


