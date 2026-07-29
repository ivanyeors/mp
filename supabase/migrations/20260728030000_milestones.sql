-- Milestone track (#79, ADR 0015). The gamified progress spine a partner sees
-- first on the hub. Unit count is DERIVED from the commission ledger (#77) — 2
-- endowed "launch partner bonus" units + the partner's NON-VOID commission rows —
-- so there is NO separate events table. This migration only stores the tunable
-- RUNG ladder, the per-partner RATCHET (max_tier, never demoted), and a durable
-- one-time-bonus record. Additive/prod-safe per ADR 0012 (create-if-not-exists,
-- service-role RLS, set_updated_at trigger). Mirrors 20260728020000_commissions.sql.
--
-- rate_bump is PERCENTAGE POINTS (matches the seeded DEFAULT scheme kind 'percent'):
-- on a rung crossing the partner's commission_schemes OVERRIDE amount is set to
-- default_percent + cumulative_rate_bump, so #77's resolveScheme picks up the higher
-- rate for SUBSEQUENT orders. (If an admin flips a scheme to 'flat', the override is
-- still written as 'percent' for that partner — documented assumption, kept simple.)

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

-- Seed the default ladder (geometric ~5/15/40/100). Cumulative rate_bump at the top
-- tier is 1+2+3+5 = 11 points over the 10% default → a 21% override. Admin-tunable.
insert into milestone_rungs (tier, units_threshold, cash_bonus, rate_bump, perk_label)
values
  (1, 5,   25,  1, 'Welcome kit'),
  (2, 15,  75,  2, 'Priority support'),
  (3, 40,  200, 3, 'Featured partner listing'),
  (4, 100, 500, 5, 'Annual partner summit invite')
on conflict (tier) do nothing;

comment on table milestone_rungs is
  'Tunable partner milestone ladder (#79, ADR 0015). rate_bump is percentage points added to the commission scheme on crossing. Unit count is derived from the non-void commissions ledger + endowed start — no events table.';
