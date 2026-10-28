-- google_places_polls is server-only, as google_reviews: RLS on with no policies,
-- client grants revoked (ADR 0035). Applied apart from
-- 20261028040928_google_reviews_places_source.sql.
revoke all on public.google_places_polls from anon, authenticated;
