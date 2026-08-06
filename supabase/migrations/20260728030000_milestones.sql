-- Milestone track (#79, ADR 0015). The gamified progress spine a partner sees
-- first on the hub. Unit count is DERIVED from the commission ledger (#77) — 2
-- endowed "launch partner bonus" units + the partner's NON-VOID commission rows —
-- so there is NO separate events table. This migration only stores the tunable
-- RUNG ladder, the per-partner RATCHET (max_tier, never demoted), and a durable
-- one-time-bonus record. Additive/prod-safe per ADR 0012 (create-if-not-exists,
-- service-role RLS, set_updated_at trigger). Mirrors 20260728020000_commissions.sql.
--
-- rate_bump is PERCENTAGE POINTS. The DEFAULT commission scheme is now flat $/unit,
-- so milestones ship PERK-ONLY: every seeded rung has rate_bump 0 (one-time cash
-- bonus + perk label only). bumpPartnerSchemes only writes a percent override when
-- the default scheme kind is 'percent', so a stray rate_bump on a flat default can
-- never create a percent blowout — see lib/milestones/ledger.ts.

-- Tunable rung ladder. Geometric thresholds ~5/15/40/100. Edited only in the Admin
-- Panel (Partner Commissions page), never shown in the Partner Hub.
create table if not exists milestone_rungs (
  id              uuid primary key default gen_random_uuid(),
  tier            int not null,                              -- 1-based ladder position
  units_threshold int not null check (units_threshold >= 0),
  cash_bonus      numeric(12,2) not null default 0 check (cash_bonus >= 0),   -- one-time $ on crossing
  rate_bump       numeric(12,2) not null default 0 check (rate_bump >= 0),    -- permanent +percentage-points to the scheme
  perk_label      text not null default '',                  -- non-cash perk shown on the hub
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- One rung per tier — makes the admin editor an idempotent upsert on tier.
create unique index if not exists idx_milestone_rungs_tier on milestone_rungs (tier);

-- Per-partner ratchet + endowed start. max_tier only ever climbs (never demotes on a
-- refund-void); endowed_units is the +2 "launch partner bonus" head start.
create table if not exists partner_milestones (
  partner_id    uuid primary key references partners(id) on delete cascade,
  max_tier      int not null default 0,
  endowed_units int not null default 2,
  updated_at    timestamptz not null default now()
);

-- Durable one-time cash-bonus record; unique on (partner_id, tier) so a bonus is
-- granted (and shown) exactly once even under concurrent/retried hook calls.
create table if not exists milestone_bonuses (
  id           uuid primary key default gen_random_uuid(),
  partner_id   uuid not null references partners(id) on delete cascade,
  tier         int not null,
  cash_bonus   numeric(12,2) not null default 0,
  perk_label   text not null default '',
  created_at   timestamptz not null default now()
);
create unique index if not exists idx_milestone_bonuses_key on milestone_bonuses (partner_id, tier);
create index if not exists idx_milestone_bonuses_partner on milestone_bonuses (partner_id);

-- updated_at triggers (shared set_updated_at()).
drop trigger if exists trg_milestone_rungs_updated_at on milestone_rungs;
create trigger trg_milestone_rungs_updated_at
before update on milestone_rungs
for each row execute procedure set_updated_at();

drop trigger if exists trg_partner_milestones_updated_at on partner_milestones;
create trigger trg_partner_milestones_updated_at
before update on partner_milestones
for each row execute procedure set_updated_at();

-- All access via the server (service role); no anon/authenticated direct access.
alter table milestone_rungs enable row level security;
drop policy if exists "Service role full access milestone_rungs" on milestone_rungs;
create policy "Service role full access milestone_rungs" on milestone_rungs
  for all using (true) with check (true);

alter table partner_milestones enable row level security;
drop policy if exists "Service role full access partner_milestones" on partner_milestones;
create policy "Service role full access partner_milestones" on partner_milestones
  for all using (true) with check (true);

alter table milestone_bonuses enable row level security;
drop policy if exists "Service role full access milestone_bonuses" on milestone_bonuses;
create policy "Service role full access milestone_bonuses" on milestone_bonuses
  for all using (true) with check (true);

-- Seed the default 5-rung ladder. PERK-ONLY: rate_bump 0 for every tier (the default
-- scheme is flat $/unit, so a percent bump would be incoherent). Each rung grants a
-- one-time cash_bonus + perk_label. Units / cash / perks are all admin-tunable.
insert into milestone_rungs (tier, units_threshold, cash_bonus, rate_bump, perk_label)
values
  (1, 5,    25,   0, 'Welcome kit'),
  (2, 15,   75,   0, 'Priority support'),
  (3, 40,   200,  0, 'Featured partner listing'),
  (4, 100,  500,  0, 'Annual partner summit invite'),
  (5, 1000, 5000, 0, 'Elite partner status')
on conflict (tier) do nothing;

comment on table milestone_rungs is
  'Tunable partner milestone ladder (#79, ADR 0015). Ships perk-only (rate_bump 0) since the default commission scheme is flat $/unit. Unit count is derived from the non-void commissions ledger + endowed start — no events table.';
