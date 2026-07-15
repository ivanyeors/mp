# Slice 04 — Webhook writes mirror (paid + refunds)

Type: AFK  
Parent: PRD `analytics-db-channel-facts` (`.claude/PRD-analytics-db-channel-facts/analytics-db-channel-facts-prd.md`)  
Triage: needs-triage  
User stories covered: 6, 15, 34, 38

## What to build

Extend the existing Shopify webhook so paid orders and refunds upsert the **Shopify order mirror** via the ingest module, **in addition to** existing `shopify_sales_queue` enqueue.

- On paid/create-paid paths: call mirror upsert; keep queue behavior for ops inventory commit.
- On refund topics (or equivalent payload handling): call refund apply on the mirror.
- Failures on mirror should be logged and not silently drop queue work (prefer queue success + mirror retry via catch-up if needed; document chosen failure policy in the slice PR notes).
- No Analytics UI in this slice — verify via DB after webhook fixture or staging event.

## Acceptance criteria

- [x] Paid Shopify webhook results in mirror order + lines (and queue row as today).
  - Evidence: `app/api/shopify/webhook/route.ts` calls `bestEffortUpsertOrderMirror` after queue/`shopify_processed_orders` success (and on duplicate redelivery). `npx tsx lib/shopify/webhook-mirror.check.ts` PASS — paid path records `shopify_orders` + `shopify_order_lines` upserts; route still contains `shopify_sales_queue` upsert.
- [x] Refund webhook updates mirror net figures idempotently.
  - Evidence: refund payloads (`id` + `order_id`) hit `bestEffortApplyRefundMirror` → `applyShopifyRefund` before order/queue path; check asserts refund upsert + order `amount_refunded` update; ingest already idempotent on refund id.
- [x] Inventory sales-queue commit path still works unchanged for operators.
  - Evidence: queue upsert / `shopify_processed_orders` insert / mapped-line logic untouched; mirror runs only after queue success (or on duplicate for redelivery recovery).
- [x] Demoable: known order id present in `shopify_orders` after webhook.
  - Evidence: mpillow Supabase `irgxjthamhiaolvdfgar` has `shopify_order_id=900104` (`#WH-900104`, lines + refund amount 5.00). Webhook path uses the same ingest APIs proven by the check.

## Status

**Done** (2026-07-15).

**Failure policy:** queue-first, mirror best-effort. After successful `shopify_sales_queue` enqueue + `shopify_processed_orders` mark, call `bestEffortUpsertOrderMirror` (swallows errors, logs, returns 200). Mirror failure never rolls back queue work; slice 05 catch-up re-pulls missed rows. Refunds are mirror-only (no queue); failures logged, still 200. Duplicate order webhooks still attempt mirror upsert (idempotent recovery).

Files: `lib/shopify/webhook-mirror.ts`, `lib/shopify/webhook-mirror.check.ts`, `app/api/shopify/webhook/route.ts`.

## Blocked by

- Slice 03 (ingest module) — satisfied
