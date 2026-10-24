-- Service prices (ADR 0024, PRD-service-fees-readjustment slice 02).
--
-- A Service is a price without a part: Mpillow's labour (measuring a customer,
-- re-adjusting a pillow) that consumes no inventory. It is priced in Costings like
-- everything else, but never as an Item — every Result build line is stock-checked
-- and deducted, so a fee Item with no stock would block every sale.
--
-- The key set is closed on purpose: each key is wired to a rule in code
-- (lib/pricing/service-lines.ts, lib/readjustment/eligibility.ts). A fourth service
-- is a migration plus a rule, never a row an operator invents.
--
-- msrp is NOT NULL: a missing service price is a broken deploy, not a free service.

create table if not exists service_prices (
  key text primary key
    check (key in ('measurement_premium', 'measurement_basic', 'readjustment')),
  msrp numeric(12,2) not null check (msrp >= 0),
  cost_price numeric(12,2) null check (cost_price is null or cost_price >= 0),
  currency text not null default 'SGD',
  updated_at timestamptz not null default now()
);

-- Server reads only (lib/pricing/service-prices.ts via the service role).
alter table service_prices enable row level security;

insert into service_prices (key, msrp) values
  ('measurement_premium', 50.00),
  ('measurement_basic',   30.00),
  ('readjustment',        30.00)
on conflict (key) do nothing;

-- The Complimentary re-adjustment rule, edited beside the fees on
-- Costings → Service fees. Premium-only is code, not a setting.
insert into site_settings (key, value) values
  ('readjustment_free_visits', '1'),
  ('readjustment_free_window_days', '60')
on conflict (key) do nothing;
