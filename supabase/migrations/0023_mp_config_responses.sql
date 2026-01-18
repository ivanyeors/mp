-- Persist mp-config questionnaire answers and support DB-backed suggestions.
-- Stored as jsonb for forward-compat; suggestions can be derived using current inventory/BOM config.

create extension if not exists pgcrypto;

create table if not exists mp_config_responses (
  id uuid primary key default gen_random_uuid(),
  data jsonb not null default '{}'::jsonb,
  is_final boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_mp_config_responses_updated_at on mp_config_responses (updated_at desc);

drop trigger if exists trg_mp_config_responses_updated_at on mp_config_responses;
create trigger trg_mp_config_responses_updated_at
before update on mp_config_responses
for each row execute procedure set_updated_at();

alter table mp_config_responses enable row level security;

drop policy if exists "Public read mp-config responses" on mp_config_responses;
create policy "Public read mp-config responses" on mp_config_responses
for select using (true);

drop policy if exists "Public write mp-config responses" on mp_config_responses;
create policy "Public write mp-config responses" on mp_config_responses
for insert with check (true);

drop policy if exists "Public update mp-config responses" on mp_config_responses;
create policy "Public update mp-config responses" on mp_config_responses
for update using (true) with check (true);

drop policy if exists "Public delete mp-config responses" on mp_config_responses;
create policy "Public delete mp-config responses" on mp_config_responses
for delete using (true);

