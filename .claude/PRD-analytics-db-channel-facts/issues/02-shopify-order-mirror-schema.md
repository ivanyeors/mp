# Slice 02 — Shopify order mirror schema + sync cursor

Type: AFK  
Parent: PRD `analytics-db-channel-facts` (`.claude/PRD-analytics-db-channel-facts/analytics-db-channel-facts-prd.md`)  
Triage: needs-triage  
User stories covered: 25

## What to build

Add durable finance tables for Shopify sales facts and a sync cursor, without wiring ingest yet.

- Migration: `shopify_orders` (shopify order id, name, currency, `paid_at`, financial status, totals, amount refunded, synced_at).
- `shopify_order_lines` (line identity, order FK, variant/sku/title, qty, gross revenue, `unit_cost` / `total_cost`, mapping refs, others/gap flags).
- `shopify_order_refunds` (or equivalent) idempotent by Shopify refund id.
- `shopify_sync_state` single-row cursor: phase `backfill` | `reconcile`, position, `last_success_at`.
- Keep `shopify_sales_queue` unchanged; document shared `shopify_order_id` only.
- Optional thin SQL view stub or typed empty helper for channel union — full aggregates land in slice 07.

## Acceptance criteria

- [x] Migration applies cleanly; tables exist with unique keys for order, line, and refund idempotency.
- [x] `shopify_sync_state` can store backfill/reconcile cursor fields.
- [x] No Analytics UI change required in this slice; schema is demoable via DB inspection.
- [x] Sales queue schema/behavior unchanged.

## Status

Done — verified 2026-07-15 (migration applied to mpillow Supabase `irgxjthamhiaolvdfgar`; `order-mirror-schema.check.ts` PASS; live tables + PKs confirmed; `shopify_sales_queue` untouched).

## Blocked by

- Slice 01 (glossary + ADR)
