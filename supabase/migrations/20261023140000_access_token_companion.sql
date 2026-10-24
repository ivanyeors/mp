-- A Paired build's companion carries its anchor's Result access token (ADR 0026):
-- the shopper's one status-page link proves ownership of both builds, which is
-- how "Remove Mbolster" declines the companion with the anchor's token.
--
-- 0045's unique index refused that, so every hold that added an Mbolster failed
-- writing the companion with
--   duplicate key value violates unique constraint "uq_mp_config_responses_access_token".
--
-- The token stays unique among every Result that is not a companion: unpaired
-- Results and anchors (paired_build_id = id). A companion (paired_build_id <> id)
-- is left out. An ended companion a re-hold unlinks gives up the token
-- (app/api/results/hold), so it never re-enters the index holding its anchor's.
--
-- Loosens a constraint only: safe to apply before the code that ships with it.

drop index if exists uq_mp_config_responses_access_token;

create unique index uq_mp_config_responses_access_token
  on mp_config_responses (access_token)
  where access_token is not null
    and (paired_build_id is null or paired_build_id = id);
