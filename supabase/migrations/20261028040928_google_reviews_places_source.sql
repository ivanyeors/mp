-- Google reviews through the Places API until the Business Profile API is
-- approved (PRD-google-review-replies, "Places API stopgap"; ADR 0035).
--
-- google_reviews.source: where the row was read from.
--   business_profile  the Business Profile API (accounts/{a}/locations/{l}/reviews/{r});
--                     Post reply publishes from Telegram.
--   places            the Places API (places/{placeId}/reviews/{r}); read-only, so
--                     staff reply on Google Maps and tap Mark replied. Deleted 30
--                     days after it is stored: Google's terms allow Places content
--                     only as a temporary copy. When the Business Profile API takes
--                     over, an open places row is adopted (renamed and re-sourced)
--                     rather than carded twice.
-- google_reviews.maps_uri: the review on Google Maps (Places gives one per review).
--
-- google_places_polls: one row per calendar month (UTC) of the weekly Places
--   poll — how many billed reads it made, against a cap well under Google's
--   1,000 free Place Details Enterprise + Atmosphere reads a month, and the
--   place's review count at the last read, to notice reviews the Places API
--   does not show (it returns at most 5, by relevance).
--
-- Server-only, as google_reviews: RLS on with no policies; client grants are
-- revoked in 20261028041004_google_places_polls_server_only.sql.

alter table google_reviews add column if not exists source text not null default 'business_profile'
  check (source in ('business_profile', 'places'));
alter table google_reviews add column if not exists maps_uri text;

create index if not exists idx_google_reviews_source on google_reviews (source);

create table if not exists google_places_polls (
  month          date primary key,
  calls          integer not null default 0 check (calls >= 0),
  last_polled_at timestamptz,
  rating_count   integer,
  last_error     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create or replace trigger trg_google_places_polls_updated_at
before update on google_places_polls
for each row execute procedure set_updated_at();

alter table google_places_polls enable row level security;
