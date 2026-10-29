-- Email renditions, and campaigns keeping their images (PRD-campaign-email-
-- editor slice 05), asserted against real Postgres
-- (20261030050000_media_asset_renditions.sql): one rendition per asset and
-- kind, removed with its asset; an asset any campaign's blocks place cannot
-- be deleted, draft, sent or archived; one no campaign places can.
--
-- Run from the repository root against a database with every migration
-- applied (a throwaway local one, never production). It prints one line,
-- `campaign images ok`:
--
--   psql -d <db> -v ON_ERROR_STOP=1 -q -X -t -A -f supabase/tests/email-marketing/assert-05-campaign-images.sql

\set ON_ERROR_STOP 1
set client_min_messages = error;

delete from email_campaigns where name like 'assert-ci %';
delete from media_assets where name like 'assert-ci %';

do $$
declare
  v_photo   uuid;
  v_cutout  uuid;
  v_unused  uuid;
  v_draft   uuid;
  v_content jsonb;
begin
  insert into media_assets (kind, name, hosted_url) values ('image', 'assert-ci photo', 'https://x.supabase.co/media/assert-ci-photo.webp') returning id into v_photo;
  insert into media_assets (kind, name, hosted_url) values ('image', 'assert-ci cutout', 'https://x.supabase.co/media/assert-ci-cutout.webp') returning id into v_cutout;
  insert into media_assets (kind, name, hosted_url) values ('image', 'assert-ci unused', 'https://x.supabase.co/media/assert-ci-unused.webp') returning id into v_unused;

  -- ------------------------------------------------------------ renditions
  insert into media_asset_renditions (asset_id, kind, url, storage_path, width, height, bytes, has_alpha)
  values (v_photo, 'email_1200', 'https://x.supabase.co/media/email/' || v_photo || '.jpg', 'email/' || v_photo || '.jpg', 1200, 800, 90000, false);
  begin
    insert into media_asset_renditions (asset_id, kind, url, storage_path, width, height, bytes, has_alpha)
    values (v_photo, 'email_1200', 'https://x.supabase.co/media/email/again.jpg', 'email/again.jpg', 1200, 800, 90000, false);
    assert false, 'one rendition per asset and kind';
  exception when unique_violation then null;
  end;
  begin
    insert into media_asset_renditions (asset_id, kind, url, storage_path, width, height, bytes, has_alpha)
    values (v_cutout, 'email_1200', 'https://x.supabase.co/media/email/c.png', 'email/c.png', 2400, 800, 90000, true);
    assert false, 'a rendition is at most 1,200px wide';
  exception when check_violation then null;
  end;
  begin
    insert into media_asset_renditions (asset_id, kind, url, storage_path, width, height, bytes, has_alpha)
    values (v_cutout, 'webp_2400', 'https://x.supabase.co/media/email/c.png', 'email/c.png', 1200, 800, 90000, true);
    assert false, 'only the kinds in code';
  exception when check_violation then null;
  end;
  begin
    insert into media_asset_renditions (asset_id, kind, url, storage_path, width, height, bytes, has_alpha)
    values (v_cutout, 'email_1200', 'https://x.supabase.co/media/c.png', 'c.png', 1200, 800, 90000, true);
    assert false, 'a rendition is stored under email/';
  exception when check_violation then null;
  end;
  insert into media_asset_renditions (asset_id, kind, url, storage_path, width, height, bytes, has_alpha)
  values (v_unused, 'email_1200', 'https://x.supabase.co/media/email/' || v_unused || '.png', 'email/' || v_unused || '.png', 900, 600, 4000, true);

  -- ---------------------------------------------- campaigns keep their images
  v_content := jsonb_build_object('v', 1, 'fallbacks', '{}'::jsonb, 'blocks', jsonb_build_array(
    jsonb_build_object('id', 'h', 'type', 'hero', 'image', jsonb_build_object('asset', v_photo::text, 'alt', 'A bed')),
    -- An asset named in words is words, not a placed image.
    jsonb_build_object('id', 't', 'type', 'text', 'paragraphs', jsonb_build_array(jsonb_build_object('kind', 'p', 'runs', jsonb_build_array(jsonb_build_object('text', v_unused::text)))))
  ));
  insert into email_campaigns (name, subject, content, audience) values ('assert-ci draft', 'Sleep cooler', v_content, 'subscribed') returning id into v_draft;
  insert into email_campaigns (name, subject, content, audience, archived_at)
  values ('assert-ci archived', 'Old news', jsonb_build_object('v', 1, 'fallbacks', '{}'::jsonb, 'blocks', jsonb_build_array(
    jsonb_build_object('id', 'i', 'type', 'image', 'width', 'full', 'image', jsonb_build_object('asset', v_cutout::text, 'alt', 'A pillow'))
  )), 'subscribed', now());

  begin
    delete from media_assets where id = v_photo;
    assert false, 'a draft campaign''s image stays in the library';
  exception when restrict_violation then null;
  end;
  begin
    delete from media_assets where id = v_cutout;
    assert false, 'an archived campaign''s image stays in the library';
  exception when restrict_violation then null;
  end;
  assert (select count(*) = 1 from media_asset_renditions where asset_id = v_photo), 'a refused delete keeps its rendition';

  -- Unused (only named in words): it goes, and its rendition with it.
  delete from media_assets where id = v_unused;
  assert not exists (select 1 from media_asset_renditions where asset_id = v_unused), 'a rendition goes with its asset';

  -- Once the draft no longer places it, the photo can go.
  update email_campaigns set content = jsonb_build_object('v', 1, 'fallbacks', '{}'::jsonb, 'blocks', '[]'::jsonb) where id = v_draft;
  delete from media_assets where id = v_photo;
  assert not exists (select 1 from media_assets where id = v_photo), 'an image no campaign places can be deleted';

  -- ------------------------------------------------------ server-only table
  assert (select relrowsecurity from pg_class where oid = 'public.media_asset_renditions'::regclass), 'RLS on';
  assert not has_table_privilege('anon', 'public.media_asset_renditions', 'select'), 'anon reads nothing';
  assert not has_table_privilege('authenticated', 'public.media_asset_renditions', 'select'), 'authenticated reads nothing';
end;
$$;

delete from email_campaigns where name like 'assert-ci %';
delete from media_assets where name like 'assert-ci %';

select 'campaign images ok';
