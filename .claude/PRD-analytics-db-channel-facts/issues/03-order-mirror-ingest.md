# Slice 03 — Order-mirror ingest module + tests

Type: AFK  
Parent: PRD `analytics-db-channel-facts` (`.claude/PRD-analytics-db-channel-facts/analytics-db-channel-facts-prd.md`)  
Triage: needs-triage  
User stories covered: 9–11, 15–16, 26, 28

## What to build

Pure module that turns a Shopify order/refund payload into mirror rows with Costings-frozen COGS and **Others** handling. Shared by webhook and catch-up (slices 04–05).

- `upsertShopifyOrderMirror(payload)`: set mirror `paid_at` from payment/processed time; upsert order + lines; resolve `shopify_variant_mappings` → **Costings** rollup into `unit_cost` / `total_cost`.
- Unmapped or null cost → flag **Others**; still store revenue and units; COGS 0/null as agreed.
- `applyShopifyRefund(payload)`: idempotent refund rows; net revenue; do not move `paid_at` once paid; COGS restock-aware only when restock signal applies.
- Cursor helpers for sync state advance (used by slice 05).
- Automated tests (`*.check.ts` / vitest): freeze, Others, refund netting, paid_at selection on fixtures.

## Acceptance criteria

- [x] Ingest module upserts order + lines from a fixture payload without HTTP.
  - Evidence: `planShopifyOrderMirrorUpsert` on fixture order `#9001` → 4 lines; `npx tsx lib/shopify/order-mirror-ingest.check.ts` PASS.
- [x] Mapped lines with Costings get frozen unit/total cost; later Costings changes do not auto-rewrite in this module without re-resolve.
  - Evidence: cover `unit_cost=10` / `total_cost=20`; re-plan with cheaper Costings still `10` via `mergeFrozenMirrorLine`.
- [x] Unmapped/uncosted lines are **Others** with revenue retained.
  - Evidence: uncosted variant 303 + unmapped 404 → `is_others=true`, `gross_revenue` 5 and 20, costs null.
- [x] Refund apply reduces net revenue idempotently; `paid_at` unchanged.
  - Evidence: first refund → `amountRefunded=15`; second same id no-op; re-ingest keeps `paid_at`; restock trims COGS, `no_restock` does not.
- [x] Tests cover the above external behaviors.
  - Evidence: `lib/shopify/order-mirror-ingest.check.ts` (also cursor `since_id` forward-only).

## Status

**Done** (2026-07-15). Module: `lib/shopify/order-mirror-ingest.ts`. Check: `npx tsx lib/shopify/order-mirror-ingest.check.ts` → PASS. No webhook/cron wiring (04/05). `shopify_sales_queue` untouched.

## Blocked by

- Slice 02 (mirror schema) — satisfied
