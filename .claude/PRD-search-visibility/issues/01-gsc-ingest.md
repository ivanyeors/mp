# Slice 01 — GSC snapshot ingest

Type: AFK
Parent: PRD `search-visibility` (`.claude/PRD-search-visibility/search-visibility-prd.md`)
Triage: needs-triage
User stories covered: 1, 3, 4, 7, 20

## What to build

- `lib/google/search-console.ts`: service-account auth, `searchanalytics.query` with 25k-row pagination and backoff
- Migration: `seo_daily_metrics` (unique `(date, source, dimension, key)`, stores `position_sum`), admin-only RLS
- `lib/seo-metrics/ingest-gsc.ts`: dimension sets `total`, `query`, `page`, `country`, `device`; re-fetch the last 3 days every run
- One-off backfill script for the full 16 months available on day one
- Chain the ingest into the `results-sla` cron after `ga-sync` (Hobby plan: 2 crons)
- `.env.example`: `GOOGLE_SEARCH_CONSOLE_SITE_URL`, service-account vars
- OPS: add the service account as a restricted user on the GSC property

## Acceptance criteria

- [ ] Backfill loads ≥15 months of `total` rows for `custom.mpillow.com`
- [ ] Re-running the ingest for the same window changes no row counts (idempotent)
- [ ] Last 3 days are overwritten on each run
- [ ] Unit tests: pagination stop, upsert, `position_sum` math
- [ ] A missing env var makes the ingest a logged no-op, not a failure of `results-sla`

## Blocked by

None
