-- Sizing photos live on Google Drive (ADR 0059; CONTEXT.md — **Sizing photo**).
--
-- A photo is still saved here first, exactly as before, so the customer never waits on
-- Google. Right after, the server copies it to Drive, checks Drive holds the same bytes,
-- and clears data_url. The row then keeps the Drive file id, the view, the check result
-- and the dates: a few hundred bytes instead of a few hundred KB.
--
--   data_url       the photo, only while it waits to move. Null once it is on Drive.
--   drive_file_id  the photo on Drive (lib/results/sizing-photo-drive.ts). While both are
--                  set, data_url is the newer photo: the customer replaced it and the new
--                  one has not moved yet; the move then trashes the old file.
--   screened_view  the view Claude saw on a photo that passed: front, back or side. The
--                  front slot takes a photo from behind (ADR 0047), so this picks the
--                  Drive folder: front, back or side. Null for a photo not yet checked.
--
-- A Drive file keeps its id when a person moves it between folders, so labelling photos
-- by dragging them in Drive never breaks this link.

alter table public.mp_config_response_photos
  alter column data_url drop not null,
  add column if not exists drive_file_id text,
  add column if not exists screened_view text;

alter table public.mp_config_response_photos
  drop constraint if exists mp_config_response_photos_has_photo_check;
alter table public.mp_config_response_photos
  add constraint mp_config_response_photos_has_photo_check
  check (data_url is not null or drive_file_id is not null);

alter table public.mp_config_response_photos
  drop constraint if exists mp_config_response_photos_screened_view_check;
alter table public.mp_config_response_photos
  add constraint mp_config_response_photos_screened_view_check
  check (screened_view is null or screened_view in ('front', 'back', 'side'));

-- The photos still waiting to move, oldest first: the move after each upload, the daily
-- catch-up and its alert read only these.
create index if not exists idx_mp_config_response_photos_waiting
  on public.mp_config_response_photos (updated_at)
  where data_url is not null;
