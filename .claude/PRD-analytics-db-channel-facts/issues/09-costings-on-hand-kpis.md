# Slice 09 — Costings as-of-now on-hand KPI cards

Type: AFK  
Parent: PRD `analytics-db-channel-facts` (`.claude/PRD-analytics-db-channel-facts/analytics-db-channel-facts-prd.md`)  
Triage: needs-triage  
User stories covered: 21, 40

## What to build

Move the former Analytics on-hand value strip onto **Costings**, next to the price source of truth.

- Cards: inventory at cost, potential revenue (MSRP), unrealized gross margin, weighted gross margin %.
- Same formulas as prior Analytics: active items × `item_prices` × `inventory_balances.on_hand` (clamp negatives as before unless intentionally fixed).
- Label clearly as **as-of now** (not date-range sales).
- Can ship in parallel with mirror work once glossary (slice 01) exists; Analytics removal of cards is slice 08.

## Acceptance criteria

- [x] Costings page shows the four as-of-now KPI cards with correct formulas.
  - Evidence: `app/[lang]/settings/costings/page.tsx` renders Inventory at cost / Potential revenue (MSRP) / Unrealized gross margin / Weighted gross margin % via `computeOnHandValueKpis`; Analytics `totals` useMemo now calls the same helper.
- [x] Copy makes clear values are current stock, not a sales period.
  - Evidence: heading “On-hand stock value” + “As of now — current warehouse stock × Costings prices (not a sales date range).”
- [x] No dependency on Shopify mirror for these cards.
  - Evidence: Costings `load()` fetches only `items` + `item_prices` + `inventory_balances` for KPIs (`ponytail:` comment in page); helper has no mirror imports.

## Status

Done (2026-07-15). Shared formula in `lib/costings/on-hand-value-kpis.ts`; assert check `npx tsx lib/costings/on-hand-value-kpis.check.ts` passes. Analytics cards left in place for slice 08.

## Blocked by

- Slice 01 (glossary: stock value lives on Costings)
