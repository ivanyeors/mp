-- Slice 11: hybrid product gallery refs (Asset id + url).

alter table product_images
  add column if not exists media_asset_id uuid references media_assets (id) on delete set null;

create index if not exists idx_product_images_media_asset
  on product_images (media_asset_id)
  where media_asset_id is not null;
