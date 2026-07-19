-- Slice 12: add-on card imagery — item → primary Media Asset link.

alter table items
  add column if not exists primary_media_asset_id uuid references media_assets (id) on delete set null;

create index if not exists idx_items_primary_media_asset
  on items (primary_media_asset_id)
  where primary_media_asset_id is not null;
