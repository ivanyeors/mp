# Slice 05 — Chained daily catch-up / backfill

Type: AFK  
Parent: PRD `analytics-db-channel-facts` (`.claude/PRD-analytics-db-channel-facts/analytics-db-channel-facts-prd.md`)  
Triage: needs-triage  
User stories covered: 7–8, 37

## What to build

Hobby-safe historical + reconcile pull that fills the mirror without a third Vercel cron entry.

- Implement catch-up runner: Admin API incremental pages, respect rate limits, time/page budget per invoke, advance `shopify_sync_state`.
- Phase: backfill as far as API allows, then reconcile “since last success.”
- Chain invocation from existing `results-sla` daily cron (after SLA work) — do **not** add a third `vercel.json` cron.
- Uses ingest module only (no duplicate upsert logic).
- Optional internal route callable with `CRON_SECRET` for manual ops trigger (not a Staff Analytics button).

## Acceptance criteria

- [x] Daily results-SLA run triggers mirror catch-up (or documented chain equivalent).
  - Evidence: `app/api/cron/results-sla/route.ts` calls `runShopifyOrderMirrorCatchup()` after SLA work (same request). Comment documents chain.
- [x] Cursor advances across runs; partial progress survives timeout.
  - Evidence: fixture check — `maxPages=1` leaves `cursor_token` + `since_id`; second invoke resumes → `phase=reconcile`.
- [x] No new `vercel.json` cron entry.
  - Evidence: `vercel.json` crons length === 2; catch-up path not listed.
- [x] Catch-up upserts go through the same ingest module as webhook.
  - Evidence: `runShopifyOrderMirrorCatchup` → `upsertShopifyOrderMirror` (default path).
- [x] `vercel.json` still has exactly two crons.
  - Evidence: check asserts `crons.length === 2`.

## Status

**Done** (2026-07-15). Runner: `lib/shopify/order-mirror-catchup.ts`. Chain: same-request after results-SLA. Ops: `GET/POST /api/cron/shopify-order-mirror-catchup` (`CRON_SECRET`, not in `vercel.json`). Check: `npx tsx lib/shopify/order-mirror-catchup.check.ts` → PASS.

## Blocked by

- Slice 03 (ingest module) — satisfied
