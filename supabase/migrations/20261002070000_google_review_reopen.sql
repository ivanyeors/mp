-- Reopening Google review cards (PRD-google-review-replies).
--
-- When a reviewer moves their rating into another reply type after the review
-- was answered or set aside — 5★ down to 2★, or 2★ back up to 5★ — the review
-- gets a fresh card so the reply on Google can be replaced to fit. These record
-- that it reopened and from which rating, for the card's banner and for
-- Claude's new draft. reopened_from_rating is null when the earlier rating is
-- unknown (a review first seen already edited after its reply).
--
-- A separate file rather than an edit to 20261002060000 so it applies cleanly
-- whether or not that one has been pushed already.

alter table google_reviews add column if not exists reopened_at timestamptz;
alter table google_reviews add column if not exists reopened_from_rating smallint
  check (reopened_from_rating between 1 and 5);
