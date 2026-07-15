# PRD: Prospect journey analytics

Status: Draft (needs-triage)
Source: Grill-with-docs session Jul 2026 + storefront/analytics audit
ADR: `docs/adr/0007-first-party-journey-analytics.md` (to write; 0006 is Analytics DB channel facts)
Glossary: `CONTEXT.md` — **Customer**, **Order**, **Result**, **Discovery source**, **Admin Panel**, **Staff**, **Sign in**; new terms **Visitor**, **Visit**, **Prospect**, **Entry source**, **Drop-off**

## Problem Statement

Staff on Admin Panel → Analytics can see ops/finance (margin, inventory, Shopify channel facts, mp-config answer bars) but cannot see **why Prospects leave** before they buy.

Today there is no first-party page/section journey store: production only loads GTM/gtag; configurator draft UUIDs are not analytics identity; **Discovery source** is self-reported at hold and missing for most browsers that never reach that step. Staff cannot answer:

- Where did this unique browser enter (**Entry source**)?
- Which pages did they traverse, including loops back to the same page?
- On which **page and section** did they **Drop-off**, and how long did they dwell?
- Did the same **Visitor** return later, and to which page?
- For the minority who convert (`orders.paid_at`), what was last-touch Entry source, journey duration, and order value?

Without this, UX and copy fixes are guesswork. The existing Analytics page must gain a Prospect-first journey view without replacing P&L charts.

## Solution

Ship a **Prospect-first journey transition graph** as the **first section** on Admin Analytics (above Product Configuration), backed by **our DB as source of truth**:

1. **Visitor** — long-lived first-party UUID; persist GA `client_id` / `user_pseudo_id` for stitch; merge to a person only via email / **Customer** (no probabilistic cross-device merge).
2. **Visit** — session unit with frozen **Entry source** (UTM → referrer → Direct), IP→country, 30-minute inactivity (or `pagehide`) → **Drop-off** on last page/section + dwell.
3. **First-party events** — page_view / section_view / heartbeat into Supabase; dual-write `dataLayer` for GTM; never collect on Admin Panel routes.
4. **GA → DB** — GA4 BigQuery export synced into staging; stitch via GA client id on **Visitor**. Admin graph reads DB only.
5. **Unique-node transition graph** (not Sankey) — pages as nodes (expand → sections); loops reuse the same node; custom node chrome (Prospects, drop-off %, median dwell, top drop-off section, return hits/gap); **Drop-off** primary sink; muted **Converted** sink behind toggle; multi-select country with **color-by-country**.
6. **Analytics notice** — non-blocking bar: by using the site you agree we collect visit data to improve the experience; Got it dismiss; always collect full stack.
7. **Instrumentation** — page-level on all non-admin routes; section-level first on home, product detail, configurators, checkout/Result path.
8. Glossary + ADR 0007.

## User Stories

1. As Staff on Analytics, I want a journey graph as the first section above Product Configuration, so that Prospect drop-off is the first thing I see.
2. As Staff, I want the graph to default to **Prospects** (no paid **Order**), so that converters do not dominate the story.
3. As Staff, I want unique page nodes with loops back to the same page, so that renavigation does not duplicate Home/Shop columns.
4. As Staff, I want to expand a page node into section nodes, so that I can drill into UX/copy friction on that page.
5. As Staff, I want to collapse section nodes back to the page, so that the graph stays readable.
6. As Staff, I want each page node to show Prospect count, drop-off rate, median dwell, top drop-off section, return hits, and median return gap, so that I can triage without leaving the canvas.
7. As Staff, I want section nodes to show Prospects, median dwell, drop-off count, and share of that page’s drop-offs, so that I can zero in on a block.
8. As Staff, I want a primary **Drop-off** sink fed from last page/section, so that exits are explicit.
9. As Staff, I want edge thickness to reflect transition volume, so that dominant paths stand out.
10. As Staff, I want dashed re-entry cues when a **Visitor** returns after a prior Drop-off, so that returns are visible without multi-day spaghetti paths.
11. As Staff, I want filters for date range, so that I can inspect a campaign window.
12. As Staff, I want multi-select **country** filter, so that I can focus one or more markets.
13. As Staff, when two or more countries are selected, I want edges/flows colored by country with a legend, so that I can compare markets on one canvas.
14. As Staff, I want Entry source filter, so that I can isolate Instagram vs Google vs Direct paths.
15. As Staff, I want New vs Returning **Visitor** filter, so that I can separate first-time and come-back behavior.
16. As Staff, I want an **Include converted** toggle (off by default), so that I can optionally see the Converted sink without losing Prospect focus.
17. As Staff, when Include converted is on, I want a muted **Converted** sink, so that purchases are secondary visually.
18. As Staff, I want Converted detail to show last-touch **Entry source**, journey duration (first Visit start → `paid_at`), order value, and a short page path, so that successful sales are attributable.
19. As Staff, I want clicking a page node to open an **Expanded node** (in-place taller chrome — not a side panel) with exit sections as storefront anchor links, exit share %, outbound transitions, dwell distribution, sample paths, and return timeline, so that I can dig deeper than node chrome without covering the graph.
20. As Staff, I want “why they left” to remain our interpretation from when/what/dwell, so that we do not pretend clickstream is a survey.
21. As a storefront visitor, I want a non-blocking notice that using the site means we collect visit data to improve the experience, so that collection is disclosed without an opt-out wall.
22. As a storefront visitor, I want Got it to dismiss the notice and stay dismissed, so that it does not nag every Visit.
23. As a storefront visitor, I want browsing never blocked by the notice, so that configurators and checkout stay usable.
24. As a Prospect, I want my browsing recorded at page level on every non-admin page, so that Staff can see where I went.
25. As a Prospect on home, product detail, configurators, or checkout/Result, I want section/step exposure recorded, so that Staff can see exact drop-off blocks.
26. As a Prospect, I want my **Visit** to end after 30 minutes of silence (or tab close when detectable), so that Drop-off reflects real abandonment.
27. As a returning Prospect on the same browser with a persistent **Visitor**, I want later Visits linked, so that return landing page and gap are measurable.
28. As a Prospect who later Signs in or enters email at hold/checkout, I want prior **Visitor** history stitched to that identity, so that cross-device continues only after a deterministic key.
29. As a Prospect on a new device with no email yet, I want a new **Visitor**, so that we do not falsely merge roommates via IP/fingerprint.
30. As the system, I want **Entry source** frozen at Visit start from UTM else referrer else Direct, so that “From” is machine-captured and distinct from **Discovery source**.
31. As Staff, I must not confuse **Entry source** with **Discovery source**, so that self-reported “how did you hear” stays a separate later filter.
32. As the system, I want IP used only to derive ISO country on the **Visit** (no raw IP retained as a product field), so that country filtering works for Prospects.
33. As the system, I want events ingested into our DB via a first-party collector, so that Admin Analytics does not depend on the GA UI.
34. As the system, I want the same events mirrored to `dataLayer`/GTM where applicable, so that marketing tags stay populated.
35. As the system, I want GA4 BigQuery export rows synced into our DB in v1, so that GA extract also lives in our SoT.
36. As the system, I want GA client id stored on **Visitor**, so that GA staging rows can stitch to our UUID.
37. As Staff, I want the journey graph to read only our DB, so that GA latency or UI limits never break Admin Analytics.
38. As the system, I want no journey collection on Admin Panel (`/settings/*`), so that Staff traffic does not pollute Prospect funnels.
39. As Staff without `analytics` permission, I must not see journey aggregates, so that RBAC matches the rest of Analytics.
40. As a developer, I want **Visitor identity**, **Visit lifecycle**, **Entry source resolution**, and **Journey aggregates** testable in isolation, so that merge/timeout/graph rules do not regress silently.
41. As a domain expert, I want **Visitor**, **Visit**, **Prospect**, **Entry source**, and **Drop-off** in `CONTEXT.md`, so that agents and Staff share language.
42. As a domain expert, I want ADR 0007 recording DB SoT, always-on collection with notice, Visitor+GA stitch, transition graph over Sankey, and Prospect-default viz, so that future readers know why.
43. As QA, I want to walk a tagged storefront path and see page→section→Drop-off appear in Admin after ingest, so that the tracer is demoable.
44. As QA, I want to loop Home→Shop→Home and see one Home node with a back-edge, so that unique-node behavior is proven.
45. As QA, I want selecting two countries to color flows by country, so that comparison mode is proven.
46. As QA, I want a paid **Order** linked Visitor to appear under Include converted with last-touch Entry source and value, so that Converted attribution is proven.
47. As Staff, I want existing margin/inventory/channel P&L charts to remain below the journey section, so that this PRD does not remove ADR 0006 Analytics work.
48. As a developer, I want section tags additive (`data-section` / `data-step`), so that untagged pages still contribute page-level nodes.
49. As Staff, I want Unknown country bucket when geo fails, so that filters do not drop those Visits silently.
50. As the system, I want Converted attribution to use **last-touch Entry source** on the paying Visit, so that credit rules stay simple in v1.

## Implementation Decisions

### Modules (agreed)

| Module | Responsibility | Automated tests? |
|--------|----------------|------------------|
| **1. Visitor identity** | Mint/read Visitor UUID cookie; attach GA client id; merge on email/**Customer** only | **Yes** |
| **2. Visit lifecycle** | Start Visit + Entry source + country; end on 30m / `pagehide`; Drop-off page/section/dwell | **Yes** |
| **3. Event ingest** | Beacon API → ingest route; page/section/heartbeat; exclude `/settings`; dual-write `dataLayer` | Thin wiring; rules in 1–2 |
| **4. GA sync** | BigQuery export → `analytics_ga_*` staging; stitch on `ga_client_id` | Staging/ops verification |
| **5. Journey aggregates** | Unique-node graph model + filters (Prospect default, country colors, Include converted, Entry source, New/Returning) from DB only | **Yes** |
| **6. Journey graph UI** | First Analytics section; custom nodes; expand/collapse sections; sinks; **Expanded node** dig-in (no side panel); filters | Staging QA |
| **7. Analytics notice** | Non-blocking bar; Got it persistence; always collect | No (copy/UX) |
| **8. Section instrumentation** | `data-section` / `data-step` on home, PDP, configurators, checkout/Result | Manual QA |
| **9. Docs** | CONTEXT glossary + ADR 0007 | No |

### Technical clarifications

1. **Source of truth:** Supabase journey tables. Admin graph never queries GA live.
2. **Prospect:** **Visitor** with no paid **Order** (`orders.paid_at` / capture path). Default cohort for the graph.
3. **Visitor vs Customer:** **Customer** remains Sign-in shopper identity. **Visitor** is analytics browser identity until deterministic merge.
4. **No probabilistic merge:** IP/UA/fingerprint must not auto-merge Visitors across devices.
5. **Entry source ≠ Discovery source:** Entry source is UTM/referrer/Direct at Visit start; **Discovery source** stays Result questionnaire field.
6. **Visit timeout:** 30 minutes inactivity ends Visit; `pagehide`/`visibility` best-effort early end.
7. **Drop-off metrics:** when, last page, last section (if any), dwell — not surveyed “why”.
8. **Viz:** unique-node directed transition graph; Sankey rejected because cycles duplicate nodes.
9. **Converted:** last-touch Entry source; duration first Visit start → `paid_at`; value from order total / `amount_captured`; short path summary.
10. **Country:** IP→ISO on Visit at ingest; multi-select; color-by-country when ≥2 selected; Unknown bucket.
11. **Notice:** implied agreement by use; no Reject mode; full collection always for storefront.
12. **Admin exclusion:** tracker not mounted / ingest rejects Admin Panel paths.
13. **Instrumentation scope:** all non-admin page_view; sections on high-value surfaces first.
14. **GA in v1:** BigQuery export sync required; store GA client id on Visitor.
15. **RBAC:** same `analytics` permission as existing Analytics page/actions.
16. **Coexistence:** ADR 0006 channel P&L charts stay; journey section is additive above Product Configuration.
17. **Hobby/cron:** prefer chaining GA sync onto an existing cron budget where possible (same constraint class as ADR 0006); document if a dedicated job is unavoidable.
18. **Prior art:** Analytics page Visx stack; `GoogleAnalytics` GTM loader; `data-section` toehold on product slides; `orders.paid_at` conversion; cart_token / locale cookies (not Visitor).

### Schema sketch (conceptual)

- `analytics_visitors`: id (UUID), ga_client_id, optional customer_id / email, created_at, merged_at
- `analytics_visits`: visitor_id, entry_source / medium / campaign / referrer_host, country, started_at, ended_at, drop_off_path, drop_off_section, converted_order_id nullable
- `analytics_events`: visit_id, type (`page_view` | `section_view` | `heartbeat`), path, section_id, occurred_at, client metadata as needed
- `analytics_ga_events`: staging from BigQuery (user_pseudo_id, event params, timestamps) for stitch/reconcile

### API / UI contracts (conceptual)

- `POST` ingest: batch events + visitor/visit ids; server enriches country; idempotent enough for beacons
- Admin read: aggregate endpoint/server action → `{ nodes, edges, sinks, legend }` for filters
- UI: journey section props = date range + country[] + entry sources + visitor recency + includeConverted

## Testing Decisions

**What makes a good test:** assert external behavior of identity, Visit lifecycle, Entry source resolution, and journey aggregates (inputs → merge/timeout/drop-off/graph edges). Do not snapshot React graph layout or GA SDK internals.

**Modules under test (agreed):**

- Visitor identity: mint, persist, GA client id attach, email/**Customer** merge, no merge on device-only signals
- Visit lifecycle: Entry source freeze order, 30m timeout Drop-off fields, new Visit after gap
- Entry source resolution: UTM beats referrer beats Direct
- Journey aggregates: unique nodes + back-edge; Prospect filter excludes paid; Converted last-touch; multi-country edge coloring inputs

**Prior art:** `*.check.ts` / vitest under `lib/`; Analytics server actions patterns; ecommerce paid_at range helpers.

**Not required as automated in v1:** Visx/SVG graph chrome, notice bar, BigQuery sync job, full section tagging pass (QA stories 43–46).

## Out of Scope

- Probabilistic fingerprint / IP household merging across devices
- Exit surveys or explicit “why did you leave” capture
- Section tagging every public page on day one
- Replacing or redesigning margin/inventory/channel P&L charts (ADR 0006)
- Reading GA/GTM UIs as the Admin source of truth
- Appointments as part of this journey graph
- Real-time websocket graph updates (on-demand refresh is enough)
- First-touch or multi-touch attribution beyond last-touch Converted

## Further Notes

- Do not call this “Customer journey” in glossary/UI copy reserved for Appointment exclusions; use **Prospect** / **Visit** / **Visitor**.
- Sankey was explicitly rejected after grill: unique-node graph with loops is the product viz.
- Privacy: product chose always-on collection with a soft notice; legal review of PDPA/GDPR copy is outside engineering but privacy policy should mention visit analytics.
- Implementation plan: Cursor plan `prospect_journey_analytics`.
- Related but distinct: PRD Analytics DB channel facts (P&L); this PRD is storefront Prospect behavior.
