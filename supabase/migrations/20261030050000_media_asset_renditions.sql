-- Email renditions of Media Assets, and campaigns keeping their images
-- (PRD-campaign-email-editor slice 05).
--
-- The Media Library's images are WebP masters up to 2,400px, and classic
-- Outlook for Windows shows no WebP. An image placed in a campaign's email is
-- shown from its email rendition instead: a JPEG, or a PNG when it has
-- transparency (`has_alpha`, which also puts it on the email's light plate),
-- at most 1,200px wide, stored in the media bucket under `email/`. One per
-- asset and kind, made the first time the asset is placed and reused by every
-- campaign and every send (lib/media-assets/email-renditions.ts).
--
-- A campaign's email refers to its images by Media Asset id inside `content`.
-- A sent email points at the rendition's address for good, so an asset that
-- any campaign uses, draft, sent or archived, cannot be deleted: the Media
-- Library refuses it (lib/media-assets/index.ts) and so does this table's
-- trigger, for any other path.
--
-- Server-only, as media_assets and email_campaigns are. Idempotent.

create table if not exists public.media_asset_renditions (
  id           uuid primary key default gen_random_uuid(),
  asset_id     uuid not null references public.media_assets (id) on delete cascade,
  kind         text not null check (kind in ('email_1200')),
  -- The public address every email that shows it uses.
  url          text not null check (url ~ '^https?://[^\s]+$'),
  storage_path text not null check (storage_path like 'email/%'),
  width        integer not null check (width between 1 and 1200),
  height       integer not null check (height > 0),
  bytes        integer not null check (bytes > 0),
  has_alpha    boolean not null,
  created_at   timestamptz not null default now(),
  constraint media_asset_renditions_one_per_kind unique (asset_id, kind)
);

comment on table public.media_asset_renditions is
  'Email renditions of image Media Assets: a JPEG, or a PNG with transparency, at most 1,200px wide, made once per asset and kind and reused (PRD-campaign-email-editor slice 05).';

alter table public.media_asset_renditions enable row level security;
revoke all on public.media_asset_renditions from anon, authenticated;

-- An image a campaign uses stays in the library. The campaign's `content`
-- names it by id, as a block's `image.asset` (the rule the Media Library's
-- usage resolver reads, lib/media/image-usages.ts); any campaign counts.
create or replace function public.media_assets_keep_campaign_images()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_name text;
begin
  select c.name into v_name
  from public.email_campaigns c
  where c.content is not null
    and jsonb_path_exists(c.content, '$.blocks[*].image.asset ? (@ == $id)', jsonb_build_object('id', old.id::text))
  order by c.created_at
  limit 1;
  if v_name is not null then
    raise exception 'The email campaign "%" uses this image, so it cannot be deleted: a sent email shows it for good.', v_name
      using errcode = 'restrict_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists trg_media_assets_keep_campaign_images on public.media_assets;
create trigger trg_media_assets_keep_campaign_images
before delete on public.media_assets
for each row execute function public.media_assets_keep_campaign_images();
