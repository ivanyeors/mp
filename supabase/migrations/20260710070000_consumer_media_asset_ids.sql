-- Slice 12: hybrid Asset refs on blogs, categories, partners (url + media_asset_id).

alter table blog_posts
  add column if not exists media_asset_id uuid references media_assets (id) on delete set null;

create index if not exists idx_blog_posts_media_asset
  on blog_posts (media_asset_id)
  where media_asset_id is not null;

alter table categories
  add column if not exists media_asset_id uuid references media_assets (id) on delete set null;

create index if not exists idx_categories_media_asset
  on categories (media_asset_id)
  where media_asset_id is not null;

alter table partners
  add column if not exists media_asset_id uuid references media_assets (id) on delete set null;

create index if not exists idx_partners_media_asset
  on partners (media_asset_id)
  where media_asset_id is not null;
