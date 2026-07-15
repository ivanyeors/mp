# Slice 12 — GA→DB BigQuery sync + ga_client_id stitch

Type: AFK  
Parent: PRD `prospect-journey-analytics` (`.claude/PRD-prospect-journey-analytics/prospect-journey-analytics-prd.md`)  
Triage: needs-triage  
User stories covered: 34, 35, 36

## What to build

GA extract lives in our DB and can stitch to **Visitor**.

- Persist GA `client_id` / `user_pseudo_id` on **Visitor** from the storefront when available
- Staging table(s) for GA4 BigQuery export rows
- Sync job (prefer Hobby-safe chain on existing cron budget; document if dedicated)
- Stitch staging rows to Visitor via ga_client_id
- Admin journey graph still reads first-party aggregates as primary; GA staging for reconcile/enrichment

## Acceptance criteria

- [x] Visitor records can store ga_client_id
- [x] BigQuery export (or documented fixture path) lands rows in our DB
- [x] Rows with matching client id link to Visitor
- [x] Admin graph does not query GA live

## Blocked by

- Slice 02 — Page-view tracer

## Notes (shipped)

- Schema: `analytics_visitors.ga_client_id` (slice 02 migration) + `analytics_ga_events` staging (`20260715103000_analytics_ga_events.sql`)
- Tracker sends `_ga` → `gaClientId`; ingest set-if-null on Visitor
- Sync: chained on `/api/cron/results-sla` after Shopify catch-up (no 3rd Hobby cron)
- Fixture when BQ absent: set `GA_SYNC_FIXTURE_PATH` (default file: `lib/analytics/journey/fixtures/ga-bq-export.json`). Cron without that env only stitches existing staging rows.
- Check: `npx tsx lib/analytics/journey/ga-sync.check.ts`
- Live smoke: `npx tsx --env-file=.env.local lib/analytics/journey/slice-12.smoke.ts`

## Proof matrix

| AC | Proof |
|---|---|
| Visitor stores ga_client_id | Smoke ingest → `analytics_visitors.ga_client_id` set; set-if-null refuses clobber |
| Export/fixture lands rows in DB | Smoke `runGaSync` inserts 2 rows into `analytics_ga_events` |
| Matching client id links to Visitor | Smoke: matching row `visitor_id` set; unmatched stays null |
| Admin graph does not query GA live | `ga-sync.check` + smoke: aggregates source has no GA/BQ reads; first-party graph still loads |
