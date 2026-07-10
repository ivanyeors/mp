-- Media Asset registry (DAM). Images hosted in storage; video/PDF may be Drive-linked.

create table if not exists media_assets (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('image', 'video', 'pdf', 'link')),
  name            text not null,
  alt_text        text,
  hosted_url      text,
  drive_file_id   text,
  drive_url       text,
  mime_type       text,
  byte_size       bigint,
  width           integer,
  height          integer,
  imported_at     timestamptz,
  last_used_at    timestamptz,
  created_by      uuid references admin_users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists idx_media_assets_hosted_url
  on media_assets (hosted_url)
  where hosted_url is not null;

create unique index if not exists idx_media_assets_drive_file_id
  on media_assets (drive_file_id)
  where drive_file_id is not null;

create index if not exists idx_media_assets_name on media_assets (name);
create index if not exists idx_media_assets_kind on media_assets (kind);
create index if not exists idx_media_assets_created_at on media_assets (created_at desc);

drop trigger if exists trg_media_assets_updated_at on media_assets;
create trigger trg_media_assets_updated_at
before update on media_assets
for each row execute procedure set_updated_at();

alter table media_assets enable row level security;

drop policy if exists "Service role full access media_assets" on media_assets;
create policy "Service role full access media_assets" on media_assets
for all using (true) with check (true);
