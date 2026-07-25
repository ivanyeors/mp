-- Reference photos (ADR 0014). Staff-uploaded imagery attached to a Customisation
-- session while assisting a build. Compressed server-side (optimizeImageForWeb) and
-- stored in the public `media` bucket, but NOT registered as a Media Asset (bypasses
-- the DAM). Keyed by session_id = mp_config_responses.id (pillow) / bolster hold UUID,
-- which equals the Result id for both products.

create table if not exists config_upload (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null,
  storage_path text not null,
  hosted_url   text not null,
  mime_type    text not null,
  byte_size    bigint not null,
  width        int,
  height       int,
  created_at   timestamptz not null default now()
);

create index if not exists idx_config_upload_session on config_upload (session_id, created_at);

-- Service-role only: all access routes through /api/config-uploads behind the admin gate.
alter table config_upload enable row level security;

create policy "Service role full access config_upload" on config_upload
  for all to service_role using (true) with check (true);
