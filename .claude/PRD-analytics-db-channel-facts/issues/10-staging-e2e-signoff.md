# Slice 10 — Staging E2E signoff

Type: HITL  
Parent: PRD `analytics-db-channel-facts` (`.claude/PRD-analytics-db-channel-facts/analytics-db-channel-facts-prd.md`)  
Triage: needs-triage  
User stories covered: 38–40

## What to build

Human verification checklist on staging (or production-like env) — no new product features.

### Checklist

1. Trigger or wait for Shopify paid webhook (or catch-up) → known order appears in mirror tables.
2. Analytics → Shopify shows that order’s revenue/units in range by mirror `paid_at`.
3. Analytics → Orders shows only `paid_at` platform sales; unpaid excluded.
4. Analytics → All ≈ Orders + Shopify for the same range (allowing **Others**/netting rules).
5. Unmapped line appears under **Others**; save mapping (+ Costings if needed) → line leaves Others without waiting for cron.
6. Refund mirrored → net revenue drops; COGS only if restock path applies.
7. Costings shows on-hand KPI cards; Analytics does not.
8. Waterfall / mp-config / BOM still work on Analytics.
9. User without `analytics` cannot access page/actions.
10. Confirm still only two Vercel crons; catch-up chained from results-SLA.

## Acceptance criteria

- [ ] Checklist signed off by a human on staging (browser pass still needed — see notes).
- [x] Gaps filed as follow-ups or fixed before calling the PRD done.

## Signoff notes (2026-07-15 agent walk)

Evidence against **mpillow** Supabase + local code (PRD branch not yet on `work.mpillow.com` production).

| # | Result | Evidence |
|---|--------|----------|
| 1 | **PASS** (after fix) | Catch-up was stuck after page 1 (`page_info` + `status=any` → Shopify 400). Fixed in `lib/shopify/orders.ts`. Then backfill wrote **1699+** paid mirror orders / **4811** lines. Sync still in `backfill` (cursor mid-history). |
| 2 | **PASS** (DB) | Jun–Jul Shopify channel: **55** orders, **S$20,788** net by mirror `paid_at`. |
| 3 | **PASS** (code + empty platform) | Unpaid excluded via `paid_at` filter / `aggregateChannelSales`. Live `orders` table has **0** rows so no unpaid platform fixture. Catch-up skips non-paid (check asserts pending skipped). |
| 4 | **PASS** | Live `All === Orders + Shopify` for Jun–Jul (Orders 0 + Shopify 20788). |
| 5 | **PASS** (wiring) | Forced Others gap on costed **part** mapping → `reResolveShopifyLineCosts` graduated without cron (`updated: 1`). Mapped pillows with incomplete BOM costs correctly stay Others until Costings complete. |
| 6 | **PARTIAL** | Netting math OK (fixture `#WH-900104`: 25−5=20). Live mirror has almost no `amount_refunded` — catch-up does **not** replay historical `refunds/*`; webhook owns refunds. |
| 7 | **PASS** (static) | Costings has on-hand KPI cards; Analytics client has none (`analytics-ui.check.ts`). |
| 8 | **PASS** (static) | Waterfall / mp-config / Results / BOM surfaces still wired; `TimelinePoint` re-export bug already guarded. Browser click-through still needed once signed in. |
| 9 | **PASS** (RBAC matrix) | `staff` lacks `analytics`; page/actions assert `analytics`. No non-owner admin row to live-deny in UI. |
| 10 | **PASS** | `vercel.json` exactly **2** crons; catch-up chained from `results-sla` (not a third cron). |

### Gaps / follow-ups

1. **Fixed this walk:** Shopify `page_info` requests must not send `status` (`lib/shopify/orders.ts` + catch-up check).
2. **Follow-up:** Catch-up should optionally apply embedded/historical refunds (or a one-shot refund backfill) so net revenue isn’t webhook-only for past orders.
3. **Ops:** Finish mirror backfill to `reconcile` (keep chaining / manual `/api/cron/shopify-order-mirror-catchup`).
4. **Deploy + browser HITL:** Ship this branch, then click Analytics All/Orders/Shopify, Costings KPIs, waterfall/mp-config, and a staff login deny on staging.

## Blocked by

- Slice 04 (webhook mirror)
- Slice 05 (catch-up/backfill)
- Slice 06 (re-resolve)
- Slice 08 (Analytics UI)
- Slice 09 (Costings KPIs)
