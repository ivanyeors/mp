-- Slice 10: Product Builder — cover/case Item → overlay Media Asset (+ optional fit).
-- One mapping per item; deleting the Asset removes the mapping (preview degrades to plain silhouette).

create table if not exists item_overlay_mappings (
  item_id         bigint primary key references items (id) on delete cascade,
  media_asset_id  uuid not null references media_assets (id) on delete cascade,
  fit             jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_item_overlay_mappings_media_asset
  on item_overlay_mappings (media_asset_id);

drop trigger if exists trg_item_overlay_mappings_updated_at on item_overlay_mappings;
create trigger trg_item_overlay_mappings_updated_at
before update on item_overlay_mappings
for each row execute procedure set_updated_at();

alter table item_overlay_mappings enable row level security;

drop policy if exists "Service role full access item_overlay_mappings" on item_overlay_mappings;
create policy "Service role full access item_overlay_mappings" on item_overlay_mappings
for all using (true) with check (true);
