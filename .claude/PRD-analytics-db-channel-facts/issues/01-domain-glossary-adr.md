# Slice 01 — Domain glossary + ADR 0006

Type: AFK  
Parent: PRD `analytics-db-channel-facts` (`.claude/PRD-analytics-db-channel-facts/analytics-db-channel-facts-prd.md`)  
Triage: needs-triage  
User stories covered: 29, 30

## What to build

Record the locked Analytics vocabulary and architectural decision before schema work.

- Update `CONTEXT.md` with **Analytics channel** (`all` | `orders` | `shopify`), **Shopify order mirror** (DB finance facts for Shopify paid sales; distinct from `shopify_sales_queue`), and **Others** (unmapped or uncosted Shopify mirror lines that still count revenue/units).
- Note: Analytics sales windows use **`paid_at`**; on-hand stock value KPIs live on **Costings** (as-of-now), not Analytics.
- Write `docs/adr/0006-analytics-db-channel-facts.md`: DB-only Analytics, channel toggle, webhook-primary + Hobby-chained daily catch-up, Costings freeze at ingest, **Others** + immediate re-resolve, KPI move to Costings. Leave 0005 for Pre-order if/when filed.

## Acceptance criteria

- [x] `CONTEXT.md` defines **Analytics channel**, **Shopify order mirror**, **Others**, and the paid_at / Costings KPI relationships without implementation file paths as domain rules.
- [x] ADR 0006 exists and states why live Shopify API was rejected for Analytics reads.
- [x] ADR notes mirror ≠ sales queue and Hobby cron chain constraint.

## Status

Done — verified 2026-07-15 (glossary + ADR 0006 on disk; AC check script PASS).

## Blocked by

None - can start immediately
