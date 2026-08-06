-- Referral rail (#74, ADR 0015): attribution-only columns. Additive/prod-safe
-- per the ADR 0012 expand pattern — deployed code never reads these, so the
-- migration is invisible to production. This slice only STAMPS attribution;
-- commission creation lands in a later slice (#77).

-- Partner referral code (unique, case-insensitive). Codes are only ever
-- generated for approved partners via the hub, so a non-null code == an active
-- partner clinic.
alter table partners
  add column if not exists referral_code text;

create unique index if not exists idx_partners_referral_code
  on partners (upper(referral_code)) where referral_code is not null;

-- Visitor carries the last-touch link stamp for the 30-day window (persists
-- across visits — NOT on the frozen Visit entry_source).
alter table analytics_visitors
  add column if not exists ref_code text,
  add column if not exists ref_stamped_at timestamptz;

-- Result (mp_config_responses) carries attribution stamped at hold-create.
alter table mp_config_responses
  add column if not exists partner_id uuid references partners(id) on delete set null,
  add column if not exists ref_code text;

create index if not exists idx_mp_config_responses_partner
  on mp_config_responses (partner_id) where partner_id is not null;

-- Order carries attribution copied at capture / shop checkout. One partner per
-- order, never split.
alter table orders
  add column if not exists partner_id uuid references partners(id) on delete set null,
  add column if not exists ref_code text;

create index if not exists idx_orders_partner
  on orders (partner_id) where partner_id is not null;
