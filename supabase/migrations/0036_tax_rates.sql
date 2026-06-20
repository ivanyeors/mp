-- ============================================================
-- TAX RATES (configurable region/rate table)
-- ============================================================
-- Backs the tax module (lib/ecommerce/tax.ts). One row per taxable region;
-- checkout resolves the row matching the shipping address country (with "*"
-- as a catch-all fallback) and computes tax from `rate`/`mode`.
--
-- `mode` semantics:
--   'exclusive' — rate is added on top of the price (total includes the tax).
--   'inclusive' — rate is already embedded in the price; `tax_amount` is only
--                 recorded as the component (total is unchanged).
--
-- Confirmed rate model: Singapore GST 9%, exclusive, on subtotal only
-- (shipping not taxed), SG-only.

create table if not exists tax_rates (
  id                  uuid primary key default gen_random_uuid(),
  region              text not null,
  name                text not null default 'Tax',
  rate                numeric(6,4) not null default 0 check (rate >= 0 and rate <= 1),
  mode                text not null default 'exclusive' check (mode in ('exclusive', 'inclusive')),
  applies_to_shipping boolean not null default true,
  is_active           boolean not null default true,
  priority            integer not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- One active rule per region (lower priority wins via the loader's ordering,
-- but a region should generally have a single active rule).
create unique index if not exists idx_tax_rates_region_active
  on tax_rates(upper(region)) where is_active = true;

drop trigger if exists trg_tax_rates_updated_at on tax_rates;
create trigger trg_tax_rates_updated_at
before update on tax_rates
for each row execute procedure set_updated_at();

alter table tax_rates enable row level security;
create policy "Service role full access tax_rates" on tax_rates
  for all using (true) with check (true);

-- Seed the confirmed default: Singapore GST 9%, tax-exclusive, subtotal only.
insert into tax_rates (region, name, rate, mode, applies_to_shipping, priority)
values ('SG', 'GST', 0.09, 'exclusive', false, 0)
on conflict do nothing;
