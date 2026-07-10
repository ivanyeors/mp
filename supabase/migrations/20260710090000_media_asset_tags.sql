-- Slice 14: free-form tags on media_assets (additive org metadata).

alter table media_assets
  add column if not exists tags text[] not null default '{}';

create index if not exists idx_media_assets_tags
  on media_assets using gin (tags);
