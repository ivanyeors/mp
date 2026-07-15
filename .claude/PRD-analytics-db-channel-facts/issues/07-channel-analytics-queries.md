# Slice 07 — Channel analytics queries (All/Orders/Shopify) + tests

Type: AFK  
Parent: PRD `analytics-db-channel-facts` (`.claude/PRD-analytics-db-channel-facts/analytics-db-channel-facts-prd.md`)  
Triage: needs-triage  
User stories covered: 3–5, 19, 27–28, 32, 35–36

## What to build

DB-only query module for retrospective Analytics aggregates by **Analytics channel**.

- `getChannelSalesSummary({ channel, from, to })`: Orders = platform `paid_at` + `order_margins` only (no unpaid-by-`created_at`); Shopify = mirror nets by `paid_at`; All = union.
- Timeline + sold-unit / revenue breakdowns for margin charts, including **Others** bucket for Shopify/All.
- Replace any live `shopifyListPaidOrdersPaginated` usage in analytics actions with this module (UI wiring can finish in slice 08 if needed, but actions must not call live Shopify for charts).
- SGD-consistent money fields.
- Tests: unpaid excluded; All ≈ Orders + Shopify on fixtures; Others present in breakdown.

## Acceptance criteria

- [x] Platform realized margin path uses `paid_at` only.
- [x] Shopify aggregates read mirror tables only (no Admin API in query path).
- [x] All combines both channels for the same range under documented netting rules.
- [x] Breakdowns expose **Others** when gap lines exist.
- [x] Automated tests cover paid_at filter, channel union, Others.

## Status

Done — `lib/analytics/channel-sales.ts` + check PASS; analytics actions off live Shopify.

## Blocked by

- Slice 03 (ingest + mirror data shape; platform half alone is insufficient for Shopify/All)
