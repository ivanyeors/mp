# Slice 08 — Analytics UI: toggle, DB wire, RBAC, cleanup

Type: AFK  
Parent: PRD `analytics-db-channel-facts` (`.claude/PRD-analytics-db-channel-facts/analytics-db-channel-facts-prd.md`)  
Triage: needs-triage  
User stories covered: 1–2, 5, 20, 22–24, 31, 33

## What to build

Staff-facing Analytics retrospective P&L wired to channel queries.

- Channel toggle UI: **All | Orders | Shopify**; drives summary, timeline, margin charts.
- Remove on-hand inventory KPI cards from Analytics (moved in slice 09).
- Keep inventory movement waterfall, mp-config Results breakdown, Product Configuration BOM explorer.
- Delete mock PillowHeatmap, unused orphan chart components/actions if unreferenced, and debug `127.0.0.1:7242` ingest posts.
- RBAC: page guard + `assertAdmin("analytics")` on all Analytics server actions.
- Load on mount / channel / date range / Refresh only (no Realtime, no polling).

## Acceptance criteria

- [x] Toggle switches channel aggregates without live Shopify calls (network/DB only to our backend).  
  **Evidence:** `AnalyticsClient` passes `channel` into `getShopifySalesTimeline` / `getRealizedMarginSummary`; actions call `getChannelSalesSummary` only (no `shopifyList*`). Check: `npx tsx app/[lang]/settings/analytics/analytics-ui.check.ts`  
  **Status:** Done
- [x] On-hand KPI strip gone from Analytics.  
  **Evidence:** No “Inventory at cost” / MSRP / unrealized / weighted cards in `AnalyticsClient`; Costings still has them (`costings/page.tsx` `onHandKpis`).  
  **Status:** Done
- [x] Waterfall, mp-config, BOM explorer still present.  
  **Evidence:** `Inventory movement`, `Results`, `ProductConfigurationCard` in client; check asserts.  
  **Status:** Done
- [x] Mock/orphan/debug removed.  
  **Evidence:** Deleted `PillowHeatmap.tsx`, `MonthlyInventoryByCategoryVisx.tsx`, `UnitMarginBySkuVisx.tsx`; removed `getMonthlyInventoryByCategory`; no `127.0.0.1:7242` in analytics.  
  **Status:** Done
- [x] Role without `analytics` cannot load page or succeed on actions.  
  **Evidence:** `page.tsx` → `requireAdminPage("analytics")`; all four actions → `assertAdmin("analytics")`. Mirror Staff entry points: mapping link/delete → `assertAdmin("inventory")`; Costings save → `requireAdmin("costings")` (surface-appropriate; staff with inventory but not analytics can still map).  
  **Status:** Done
- [x] Changing channel or date range reloads retrospective blocks from DB.  
  **Evidence:** `loadTimeline` / `loadRealizedMargin` deps include `channel` + date range; Refresh reloads timeline, margin, mp-config, waterfall, items. No Realtime/polling added.  
  **Status:** Done

## Blocked by

- Slice 07 (channel query module)
