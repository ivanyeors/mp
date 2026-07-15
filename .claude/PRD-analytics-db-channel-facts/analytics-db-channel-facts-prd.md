# PRD: Analytics DB channel facts

Status: Draft (needs-triage)
Source: Grill-with-docs session Jul 2026 + inventory/costings/orders/analytics audit
ADR: `docs/adr/0006-analytics-db-channel-facts.md` (to write; leave 0005 for Pre-order if/when filed)
Glossary: `CONTEXT.md` — **Order**, **Costings**, **Item**, **Composed sellable**, **MSRP**, **Admin Panel**, **Staff**; new terms **Analytics channel**, **Shopify order mirror**, **Others**

## Problem Statement

Staff using Admin Panel → Analytics cannot trust the numbers:

- Realized margin comes from platform **Orders** + `order_margins`, while sales timeline and sold-unit margin charts call the live Shopify Admin API (silent 2,500-order cap, list price × qty, unmapped variants dropped).
- “Sold” margin incorrectly includes unpaid platform orders by `created_at`, conflicting with the glossary rule that sales windows use **`paid_at`**.
- On-hand inventory value KPIs (current warehouse state) sit on a page that should be retrospective P&L, mixing as-of-now stock with historical sales.
- Analytics server actions use admin DB access without `analytics` permission checks.
- There is no durable Shopify finance fact in our DB; ops `shopify_sales_queue` is inventory commit only, not Analytics source of truth.
- Mock/orphan chart code and local debug ingest noise the surface.

Operators need All / Orders / Shopify views that all read from our database, with Costings-derived COGS, refund-aware net revenue, and seamless graduation of unmapped lines once Staff fixes mappings or Costings.

## Solution

Make Analytics a **retrospective, DB-only** multi-channel P&L:

1. Introduce a **Shopify order mirror** (orders, lines, refunds, sync cursor) filled by **webhook-primary** ingest plus a **daily catch-up/backfill** chained off the existing results-SLA cron (Hobby: no third Vercel cron).
2. Freeze Shopify line **COGS** from **Costings** at paid ingest (same freeze-at-sale idea as platform `order_items.unit_cost`).
3. Unmapped or uncosted lines stay visible as **Others**; when Staff saves a mapping or Costings, **immediately re-resolve** those lines (no manual button; cron does not own this UX).
4. Analytics channel toggle **`[All | Orders | Shopify]`**. All = platform **Orders** ∪ Shopify mirror only (accepted **Results** are already **Orders**; in-store inventory `sell*` stays out of revenue).
5. Date ranges use **`paid_at`** on both channels (Shopify `paid_at` = payment/processed time). Unpaid never enter realized margin.
6. Mirror Shopify refunds: net revenue; COGS drops only when inventory is restocked / trusted restock signal (parallel to platform ledger vs `returned_quantity`).
7. Move on-hand inventory KPI cards to **Costings** (as-of-now). Keep inventory movement waterfall, mp-config Results breakdown, and BOM explorer on Analytics. Delete mock/orphan/debug only.
8. Guard page + actions + sync/re-resolve with `analytics` permission.
9. Write ADR 0006 and extend `CONTEXT.md`.

## User Stories

1. As Staff on Analytics, I want a channel toggle All / Orders / Shopify, so that I can see combined or per-channel P&L without leaving the page.
2. As Staff on Analytics All, I want platform **Orders** and Shopify mirrored sales summed for the same date range, so that dual-channel truth is one report.
3. As Staff on Analytics Orders, I want only platform **Orders** with **`paid_at`** in range, so that unpaid checkouts never inflate sold margin.
4. As Staff on Analytics Shopify, I want only mirrored Shopify paid sales with mirror **`paid_at`** in range, so that Shopify P&L matches our DB not a live API snapshot.
5. As Staff, I want Analytics never to call the Shopify Admin API from the page, so that charts are not truncated by pagination caps and stay consistent with stored facts.
6. As Staff, I want Shopify paid orders upserted into our DB when Shopify notifies us, so that the mirror stays fresh without a third cron.
7. As Staff, I want a daily catch-up to pull missed or historical Shopify orders into the mirror within API rate limits, so that backfill progresses on Hobby without a dedicated cron slot.
8. As Staff, I want backfill to resume from a stored cursor across days until history is exhausted, so that “as much as possible” does not require one long serverless run.
9. As Staff, I want each mirrored Shopify line to store unit/total cost frozen from **Costings** at paid ingest, so that later Costings edits do not rewrite historical margin for already-resolved lines.
10. As Staff, I want unmapped or uncosted Shopify lines to appear under **Others** with revenue and units still counted, so that sales are not silently understated.
11. As Staff, I want **Others** COGS treated as zero/unknown and the gap visible, so that I know mapping or Costings work remains.
12. As Staff, when I save a `shopify_variant_mappings` change, I want matching **Others** (or gap) lines re-resolved immediately, so that charts update without waiting for cron or a manual button.
13. As Staff, when I save **Costings**, I want affected Shopify mirror lines that were missing cost (or newly costable) re-resolved immediately, so that UX stays seamless.
14. As a developer, I want re-resolve not to blindly overwrite already-frozen costs on healthy lines unless the mapping/cost gap for that variant is being fixed, so that freeze-at-sale remains the default.
15. As Staff, I want Shopify refunds mirrored into our DB and net revenue reduced, so that Shopify margin is not gross-only.
16. As Staff, I want Shopify COGS reduced for returns only when inventory is restocked (or a trusted restock signal applies), so that money refund and physical return stay distinct like platform **Orders**.
17. As Staff, I want All to exclude in-store inventory sells that have no **Order** row, so that P&L channels stay Orders ∪ Shopify only.
18. As Staff, I want accepted **Results** counted only via the platform **Orders** they become, so that we do not double-count.
19. As Staff, I want timeline and category/product margin charts to use DB sold units/revenue (including **Others**), so that visuals match the KPI cards.
20. As Staff, I want inventory movement waterfall, mp-config Results breakdown, and Product Configuration BOM explorer to remain on Analytics, so that existing non-KPI charts are not removed in this patch.
21. As Staff, I want on-hand inventory-at-cost, potential MSRP revenue, unrealized margin, and weighted margin % on **Costings**, labeled as-of-now, so that stock value sits next to the price source of truth.
22. As Staff, I no longer want those on-hand KPI cards on Analytics, so that Analytics stays retrospective.
23. As Staff without `analytics` permission, I must not open Analytics or invoke its server actions, so that P&L data is not exposed by direct URL.
24. As Staff with `analytics`, I want sync/re-resolve paths that touch the mirror to be permission-checked appropriately, so that finance facts are not writable by arbitrary sessions.
25. As a developer, I want `shopify_sales_queue` to remain the ops inventory-commit path, separate from the **Shopify order mirror**, so that finance and warehouse jobs do not merge accidentally.
26. As a developer, I want a single ingest module shared by webhook and catch-up, so that paid upsert, COGS freeze, **Others**, and refunds stay consistent.
27. As a developer, I want channel analytics query helpers (summary, timeline, breakdowns) that take channel + date range and read only our DB, so that UI cannot reintroduce live Shopify fetches.
28. As a developer, I want automated checks for ingest netting, **Others** flagging, re-resolve graduation, and `paid_at`-only platform selection, so that regressions fail fast.
29. As a domain expert, I want ADR 0006 recording DB-only Analytics, channel toggle, webhook+chained catch-up, Costings freeze, **Others**, and KPI move, so that future optimisations do not resurrect live API charts.
30. As a domain expert, I want **Analytics channel**, **Shopify order mirror**, and **Others** in `CONTEXT.md`, so that Staff and agents share vocabulary.
31. As Staff, I want mock PillowHeatmap and unused orphan chart modules removed (or left unwired deleted), and debug posts to localhost removed, so that Analytics is not polluted by fake data paths.
32. As Staff, I want currency display to remain SGD-consistent with Costings / platform money, so that multi-channel totals are comparable.
33. As Staff, I want changing the date range or channel (and Refresh) to reload retrospective blocks from DB, so that freshness matches “on open / filter change” without Realtime or polling.
34. As an operator committing Shopify sales to inventory, I want that commit still to work as today via the sales queue, so that warehouse ops are unchanged by the finance mirror.
35. As Staff viewing All realized margin, I want platform refund-aware `order_margins` plus Shopify mirror net margin, so that All is not a mix of gross Shopify and net platform.
36. As Staff, I want unmapped Shopify revenue still included in All totals under **Others**, so that All reconciles toward Shopify paid sales even before mappings are complete.
37. As a developer, I want catch-up chained after results-SLA (or equivalent Hobby-safe chain) with a time/page budget per run, so that deploy stays within free-tier cron limits.
38. As QA, I want to verify a known Shopify order appears in the mirror and on Analytics Shopify after webhook or catch-up, so that end-to-end finance ingest is demoable.
39. As QA, I want to verify fixing a mapping moves a line out of **Others** without waiting for cron, so that re-resolve UX is proven.
40. As QA, I want to verify Costings shows the former Analytics on-hand cards and Analytics does not, so that the KPI move is complete.

## Implementation Decisions

### Modules (agreed)

| Module | Responsibility | Automated tests? |
|--------|----------------|------------------|
| **1. Shopify order mirror (schema)** | Tables: `shopify_orders`, `shopify_order_lines`, `shopify_order_refunds` (or equivalent), `shopify_sync_state`; optional SQL/TS channel aggregate helper | Smoke/constraints optional |
| **2. Order-mirror ingest** | Upsert from Shopify payload; `paid_at`; Costings COGS freeze; **Others**; refunds; cursor advance | **Yes** |
| **3. Cost re-resolve** | Immediate graduation of gap/**Others** lines on mapping or Costings save | **Yes** |
| **4. Channel analytics queries** | All / Orders / Shopify summaries, timeline, breakdowns; platform half `paid_at` + `order_margins` only; DB-only | **Yes** |
| **5. Webhook + chained catch-up** | Webhook upserts mirror (+ existing queue); daily backfill/reconcile chained from results-SLA; no third `vercel.json` cron | Thin wiring; logic in 2 |
| **6. Analytics Admin UI** | Channel toggle; wire to module 4; keep waterfall / mp-config / BOM; remove on-hand KPIs, mock/orphan/debug; RBAC | Device/staging QA |
| **7. Costings on-hand KPIs** | Four as-of-now cards from items + balances + item_prices | No (formula parity with prior Analytics) |
| **8. Docs** | ADR 0006 + CONTEXT glossary | No |

### Technical clarifications

1. **Source of truth:** Analytics reads only our DB. Shopify Admin API is ingest-only (webhook payload and catch-up pull).
2. **Analytics channel:** `all` | `orders` | `shopify`. All = union of paid platform **Orders** and **Shopify order mirror** rows in range.
3. **Not in All:** in-store `sellPillow` / `sellPart` / template sells without an **Order**; do not invent a third revenue channel in v1.
4. **Shopify order mirror vs sales queue:** mirror = finance facts; `shopify_sales_queue` = ops template commit → inventory. Share `shopify_order_id`; do not merge tables or jobs.
5. **Ingest pattern:** webhook-primary for paid orders + refunds; daily catch-up for missed webhooks and historical backfill.
6. **Hobby cron:** keep two Vercel cron entries; chain mirror catch-up after results-SLA (or documented equivalent chain). Batched pages + time budget per invoke.
7. **Backfill:** cursor in `shopify_sync_state`; phase backfill then reconcile; pull as far as Shopify rate limits allow (not a fixed 6/12-month cap).
8. **COGS:** from **Costings** (`item_prices` / `product_prices` / mapping rollup) frozen at paid ingest onto mirror lines.
9. **Others:** unmapped via `shopify_variant_mappings` or mapped but null cost → `is_others` (or equivalent); revenue/units counted; COGS 0; charts bucket as Others until re-resolved.
10. **Re-resolve:** on mapping upsert/delete and Costings save; immediate; no Staff manual control; does not replace cron catch-up.
11. **Freeze rule:** do not rewrite healthy frozen costs on every Costings edit; re-resolve fills gaps and updates lines implicated by the mapping/cost fix.
12. **paid_at (platform):** Analytics Orders / All’s Orders half = `orders.paid_at` in range only (remove unpaid-by-`created_at` from realized margin).
13. **paid_at (Shopify):** store payment/processed time on mirror; range filters use it; refunds update net money without moving original `paid_at` once paid.
14. **Refunds:** mirror Shopify refunds; net product revenue; COGS restock-aware only.
15. **Freshness:** retrospective on-demand (mount, channel, date range, Refresh). No Realtime, no polling on Analytics.
16. **KPI move:** inventory at cost, potential MSRP revenue, unrealized gross margin, weighted margin % → Costings; label as-of-now.
17. **Keep on Analytics:** inventory movement waterfall, mp-config Results metrics, Product Configuration BOM explorer.
18. **Delete:** PillowHeatmap mock, unused orphan chart components/actions if unreferenced, debug `127.0.0.1:7242` ingest.
19. **RBAC:** `requireAdminPage("analytics")` (or project equivalent) + `assertAdmin("analytics")` on Analytics actions and mirror sync/re-resolve entry points Staff can hit.
20. **Currency:** SGD-consistent display with existing Admin money formatting.
21. **Prior art:** `order_margins` / `lib/ecommerce/order-margins.ts`; Costings single price source ADR 0001; Shopify webhook + sales queue; results-SLA daily cron; `*.check.ts` / vitest ecommerce acceptance tests.

### Schema sketch (conceptual)

- `shopify_orders`: shopify order id, name, currency, `paid_at`, financial status, totals, amount refunded, synced_at
- `shopify_order_lines`: line id, order FK, variant/sku/title, qty, gross revenue, unit_cost, total_cost, mapping refs, others flag
- `shopify_order_refunds`: idempotent Shopify refund id, amounts, linkage to order/lines as needed
- `shopify_sync_state`: cursor, phase (`backfill` | `reconcile`), last_success_at

Channel aggregates: SQL view and/or TS helper unioning platform margins (paid_at-filtered) with Shopify mirror nets, tagged by channel.

## Testing Decisions

**What makes a good test:** assert external behavior of modules 2–4 (inputs → persisted mirror shape / returned aggregates), not HTTP client internals, React render trees, or Shopify SDK details. Prefer small `*.check.ts` or existing vitest patterns under `lib/`.

**Modules under test (agreed):**

- Order-mirror ingest: paid upsert, `paid_at`, Costings freeze, **Others** when unmapped/uncosted, refund netting, cursor semantics
- Cost re-resolve: gap line graduates after mapping/cost available; healthy frozen line not arbitrarily rewritten
- Channel analytics queries: Orders ignores unpaid; Shopify uses mirror `paid_at`; All ≈ Orders + Shopify for fixtures; **Others** appears in breakdowns

**Prior art:** `lib/ecommerce/order-margins.ts` + slice-09 acceptance tests; `lib/shopify/sync-scope.check.ts`; money-flow / ecommerce `__tests__`.

**Not required as automated in v1:** full webhook HTTP, cron chain, Visx charts, Costings KPI layout (staging QA stories 38–40).

## Out of Scope

- Realtime subscriptions or polling on Analytics
- Merging `shopify_sales_queue` into the finance mirror
- In-store inventory sell revenue inside All / a fourth channel toggle
- Materialized analytics warehouse / OLAP; third Vercel cron job
- Auto-restock inventory on platform or Shopify refund (manual restock paths stay)
- Changing Costings as the sole write surface for cost/MSRP (ADR 0001 unchanged)
- Google Analytics / GTM / GSC (unrelated traffic analytics)
- Rebuilding unused monthly-inventory / unit-margin-by-SKU charts (delete orphans; do not ship unfinished widgets)

## Further Notes

- Audit finding: live Shopify timeline + platform margins disagree by construction; this PRD’s primary fix is one DB fact path per channel.
- Hobby constraint is a first-class design input: chain catch-up; do not add `vercel.json` cron #3.
- Pre-order ADR may claim 0005; this work uses **0006** for analytics DB channel facts even if 0005 file is not present yet.
- Implementation plan (grill): Cursor plan `analytics_db_audit` — decisions locked in session Jul 2026.
