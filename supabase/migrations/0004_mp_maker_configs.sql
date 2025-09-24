-- mp_maker saved configurations
create extension if not exists pgcrypto;

create table if not exists mp_maker_configs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unique name per project for now (can later scope by user/tenant)
create unique index if not exists idx_mp_maker_configs_name on mp_maker_configs (name);

-- Trigger to update updated_at
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_mp_maker_configs_updated_at on mp_maker_configs;
create trigger trg_mp_maker_configs_updated_at
before update on mp_maker_configs
for each row execute procedure set_updated_at();

-- Enable RLS and allow anonymous read/write for now
alter table mp_maker_configs enable row level security;

drop policy if exists "Public read configs" on mp_maker_configs;
create policy "Public read configs" on mp_maker_configs
for select using (true);

drop policy if exists "Public write configs" on mp_maker_configs;
create policy "Public write configs" on mp_maker_configs
for insert with check (true);

-- Allow update/delete for now
drop policy if exists "Public update configs" on mp_maker_configs;
create policy "Public update configs" on mp_maker_configs
for update using (true) with check (true);

drop policy if exists "Public delete configs" on mp_maker_configs;
create policy "Public delete configs" on mp_maker_configs
for delete using (true);
