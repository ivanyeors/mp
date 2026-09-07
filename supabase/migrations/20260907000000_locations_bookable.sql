-- Locations: `bookable` says whether a Location takes appointment bookings.
-- Additive + defaulted (ADR 0012), so the deployed app is unaffected until the
-- feature deploys. Distinct from `visible`, which only governs /our-partners:
-- own studios are saved visible=false and must still be bookable.

alter table partners
  add column if not exists bookable boolean not null default true;
