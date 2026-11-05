-- Sizing photos are screened by Claude before they are kept (ADR 0047; CONTEXT.md —
-- **Sizing photo**). The customer's front and side photos reach Staff in the Mpillow
-- Telegram group, so app/api/mp-config/photos checks each one first: a real person, the
-- view it was taken for, and nothing sexually explicit. A photo that fails is never
-- stored. This records how each stored photo got through.
--
--   passed     Claude checked it and it passed. Only these are attached on Telegram.
--   unchecked  Claude could not be reached when it was uploaded (outage, rate limit,
--              no key). Kept, never attached; the submit route tries the check again.
--   null       Uploaded before screening existed. Treated as unchecked.
--
-- screening_model is the model that passed it; screened_at is when.

alter table public.mp_config_response_photos
  add column if not exists screening_status text,
  add column if not exists screening_model  text,
  add column if not exists screened_at      timestamptz;

alter table public.mp_config_response_photos
  drop constraint if exists mp_config_response_photos_screening_status_check;
alter table public.mp_config_response_photos
  add constraint mp_config_response_photos_screening_status_check
  check (screening_status is null or screening_status in ('passed', 'unchecked'));
