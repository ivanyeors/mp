-- Staff management: allow selecting who measured each mp-config response.

create extension if not exists pgcrypto;

-- Staff directory (simple name list, not auth users).
create table if not exists mp_staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_mp_staff_name_unique on mp_staff (lower(name));
create index if not exists idx_mp_staff_updated_at on mp_staff (updated_at desc);

drop trigger if exists trg_mp_staff_updated_at on mp_staff;
create trigger trg_mp_staff_updated_at
before update on mp_staff
for each row execute procedure set_updated_at();

alter table mp_staff enable row level security;

drop policy if exists "Public read staff" on mp_staff;
create policy "Public read staff" on mp_staff
for select using (true);

drop policy if exists "Public write staff" on mp_staff;
create policy "Public write staff" on mp_staff
for insert with check (true);

drop policy if exists "Public update staff" on mp_staff;
create policy "Public update staff" on mp_staff
for update using (true) with check (true);

drop policy if exists "Public delete staff" on mp_staff;
create policy "Public delete staff" on mp_staff
for delete using (true);

-- Link each mp_config_responses row to either a staff member or "by user".
alter table mp_config_responses
  add column if not exists measured_by_type text not null default 'by_user',
  add column if not exists measured_by_staff_id uuid null references mp_staff(id) on delete set null;

-- Backfill existing rows.
update mp_config_responses
set measured_by_type = 'by_user', measured_by_staff_id = null
where measured_by_type is null;

-- Enforce consistency.
alter table mp_config_responses
  drop constraint if exists mp_config_responses_measured_by_check;
alter table mp_config_responses
  add constraint mp_config_responses_measured_by_check
  check (
    (measured_by_type = 'by_user' and measured_by_staff_id is null) or
    (measured_by_type = 'staff' and measured_by_staff_id is not null)
  );

