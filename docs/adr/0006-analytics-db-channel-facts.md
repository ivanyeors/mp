# Analytics reads DB channel facts; Shopify Admin API is ingest-only

Staff on Admin Panel → Analytics need trustworthy multi-channel P&L. Live Shopify Admin API charts (list price × qty, silent pagination caps, unpaid-by-`created_at` conflated with sold margin) disagree with platform **Orders** + `order_margins` by construction. On-hand stock value KPIs mixed retrospective sales with as-of-now warehouse state.

## Decision

1. **DB-only Analytics reads.** Platform half uses paid **Orders** (`paid_at` in range) + `order_margins`. Shopify half uses the **Shopify order mirror**. No live Shopify Admin API from the Analytics page.
2. **Analytics channel** toggle: `all` | `orders` | `shopify`. All = paid **Orders** ∪ mirror only (accepted **Results** via the **Order** they become; in-store inventory sells without an **Order** stay out).
3. **Webhook-primary ingest** into the mirror (paid orders + refunds); **daily catch-up/backfill** chained after the existing results-SLA cron (Hobby: no third `vercel.json` cron). Cursor in `shopify_sync_state` resumes across days.
4. **Costings freeze at paid ingest** onto mirror lines (same idea as platform `order_items.unit_cost`). Unmapped/uncosted lines are **Others** (revenue/units count; COGS zero/unknown) until mapping or Costings save **immediately re-resolves** gaps — without rewriting healthy frozen costs.
5. **Mirror ≠ `shopify_sales_queue`.** Mirror = finance facts; queue = ops inventory commit. Share `shopify_order_id`; do not merge tables or jobs.
6. **On-hand KPIs move to Costings** (inventory at cost, potential MSRP revenue, unrealized margin, weighted margin %), labeled as-of-now. Analytics keeps waterfall / mp-config Results / BOM explorer; drops those stock-value cards.

Leave ADR **0005** for Pre-order if/when filed; this decision is **0006**.

## Considered options

- **Live Shopify Admin API for Analytics charts** — rejected: pagination caps, list-price COGS, unpaid noise, and drift from stored platform facts.
- **Third Vercel cron for mirror catch-up** — rejected on Hobby free-tier cron limits; chain after results-SLA instead.
- **Merge finance mirror into `shopify_sales_queue`** — rejected: finance vs warehouse jobs must not share one table/lifecycle.
- **Keep on-hand value cards on Analytics** — rejected: as-of-now stock is not retrospective P&L; **Costings** is the price/stock value home.

## Consequences

- Operators trust All / Orders / Shopify from one DB path; currency stays SGD-consistent with Costings.
- Mirror freshness is webhook + chained catch-up; Analytics refresh is on-demand (mount / filter / Refresh), not Realtime.
- Glossary terms: **Analytics channel**, **Shopify order mirror**, **Others** in `CONTEXT.md`.
