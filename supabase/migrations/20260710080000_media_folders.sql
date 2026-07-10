-- Slice 13: flat DAM folders + nullable folder_id on media_assets.

create table if not exists media_folders (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint media_folders_name_unique unique (name)
);

drop trigger if exists trg_media_folders_updated_at on media_folders;
create trigger trg_media_folders_updated_at
before update on media_folders
for each row execute procedure set_updated_at();

alter table media_folders enable row level security;

drop policy if exists "Service role full access media_folders" on media_folders;
create policy "Service role full access media_folders" on media_folders
for all using (true) with check (true);

alter table media_assets
  add column if not exists folder_id uuid references media_folders (id) on delete set null;

create index if not exists idx_media_assets_folder_id
  on media_assets (folder_id)
  where folder_id is not null;
