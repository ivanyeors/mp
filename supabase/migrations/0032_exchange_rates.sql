-- Exchange rates table for currency conversion display
-- Rates are cached here and refreshed periodically from an external API

create table if not exists exchange_rates (
  base_currency   text not null default 'SGD',
  target_currency text not null,
  rate            numeric(14, 6) not null,
  source          text not null default 'manual',  -- 'manual' | 'api'
  fetched_at      timestamptz not null default now(),
  primary key (base_currency, target_currency)
);

-- Seed with approximate manual fallback rates (SGD base)
insert into exchange_rates (base_currency, target_currency, rate, source) values
  ('SGD', 'MYR', 3.45, 'manual'),
  ('SGD', 'USD', 0.74, 'manual'),
  ('SGD', 'CNY', 5.35, 'manual'),
  ('SGD', 'IDR', 11600.00, 'manual'),
  ('SGD', 'THB', 25.80, 'manual'),
  ('SGD', 'PHP', 41.50, 'manual'),
  ('SGD', 'BND', 1.00, 'manual')
on conflict (base_currency, target_currency) do nothing;
