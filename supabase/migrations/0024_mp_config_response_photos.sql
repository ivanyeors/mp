-- Store mp-config photos (front/side) temporarily for Telegram notifications.
-- Stored as data URLs to keep upload simple (2 images per response max).
-- Note: response ids are UUIDs; for higher privacy, consider locking down RLS policies.

create extension if not exists pgcrypto;

create table if not exists mp_config_response_photos (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references mp_config_responses(id) on delete cascade,
  view text not null,
  data_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mp_config_response_photos_view_check check (view in ('front', 'side'))
);

create unique index if not exists idx_mp_config_response_photos_response_view
  on mp_config_response_photos (response_id, view);

create index if not exists idx_mp_config_response_photos_updated_at
  on mp_config_response_photos (updated_at desc);

drop trigger if exists trg_mp_config_response_photos_updated_at on mp_config_response_photos;
create trigger trg_mp_config_response_photos_updated_at
before update on mp_config_response_photos
for each row execute procedure set_updated_at();

alter table mp_config_response_photos enable row level security;

drop policy if exists "Public read mp-config response photos" on mp_config_response_photos;
create policy "Public read mp-config response photos" on mp_config_response_photos
for select using (true);

drop policy if exists "Public write mp-config response photos" on mp_config_response_photos;
create policy "Public write mp-config response photos" on mp_config_response_photos
for insert with check (true);

drop policy if exists "Public update mp-config response photos" on mp_config_response_photos;
create policy "Public update mp-config response photos" on mp_config_response_photos
for update using (true) with check (true);

drop policy if exists "Public delete mp-config response photos" on mp_config_response_photos;
create policy "Public delete mp-config response photos" on mp_config_response_photos
for delete using (true);

