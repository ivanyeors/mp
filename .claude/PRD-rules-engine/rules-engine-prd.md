# PRD: Rules Engine — node-based measurement → recommendation authority

Status: Draft (needs-triage)
Source: Grill-with-docs session Jul 19 2026 (Your Custom Mpillow — measurement input → calculation → suggestion)
ADRs: `docs/adr/0010-rules-engine-single-recommendation-authority.md` (single authority), `docs/adr/0008-spatial-filling-placements.md` (templates are spatial; pack list derived), `docs/adr/0003-fillings-only-in-filling-templates.md` (fillings only in templates), `docs/adr/0002-authorize-then-capture-customised-goods.md` (hold → assign → Accept → capture)
Glossary: `CONTEXT.md` — **Rules Engine**, **Rule graph**, **Input node**, **Range node**, **Match node**, **Combine node**, **Terminal**, **Fallback**, **Recommendation record**, **Evaluation trace**, **Upsell card**, **Filling Template**, **Default Filling Template**, **Result**, **Product Builder**

## Problem Statement

Three hardcoded sizing engines disagree (online ballpark `SIZE_MAP`, in-store shoulder bands, basic recommend), the Premium neck measurements are collected but never used, skipped measurements silently default (shoulder 40 cm, neck 8/10/10) and fabricate a Size M, tier is stuck on basic for the online path, and every change to the logic requires a deploy. Staff cannot see, tune, or extend the measurement → size / fillings logic; there is no upsell path when a Basic shopper's answers clearly call for Premium; and no record explains *why* a past customer was recommended a given size and mix.

## Solution

A **Rules Engine**: a ComfyUI-style infinite-canvas node workbench in the Admin Panel (entry point inside **Product Builder** under Landing Site) where **Staff** author one **Rule graph** per flow — Premium Mpillow, Basic Mpillow, Mbolster. The published graph is the **single recommendation authority**: online ballpark, in-store suggestion, and basic recommend all evaluate the same graph. Graphs map measurement ranges to sizes (`shoulder → size`, `height → length`), measurement-range combinations to size-scoped **Filling Templates** (`(neck-to-back, head-to-back, neck-length) → template`), branch on any configurator answer, advise tier upgrades, and route upsell/cross-sell between flows (Basic → Premium, Bolster → Basic/Premium) via a consent card — all resolved before the Stripe hold. Every **Result** stores a **Recommendation record** (graph version, fired terminals, resolved outputs, evaluation trace, entry→final flow journey). Guests see the recommended size, a plain-language why, and the recommended filling mix — only on the fully completed "Your Custom Mpillow" preview. All engine inputs become required (default unit: inches); silent defaults are removed.

## User Stories

### Staff authoring (workbench)

1. As a Staff member, I want a Rules Engine entry point inside Product Builder, so that recommendation logic has one discoverable home.
2. As a Staff member, I want an infinite-canvas node workbench (pan, zoom, drag, connect, palette), so that complex decision logic stays legible at scale.
3. As a Staff member, I want a flow switcher (Premium Mpillow / Basic Mpillow / Mbolster), so that each product family has its own starting graph.
4. As a Staff member, I want Range nodes authored in inches, so that bands match how we measure onsite.
5. As a Staff member, I want Range node bands validated as contiguous and non-overlapping, so that no measurement can fall between or into two bands.
6. As a Staff member, I want Match nodes on any collected answer (sleep position, bed firmness, acid reflux, ear discomfort, blood pressure, pain areas, uses bolster, gender, age group), so that rules can branch on the full mp-config form.
7. As a Staff member, I want Combine nodes that AND multiple branches, so that three-measurement range rules express directly.
8. As a Staff member, I want Size output terminals, so that a path resolves to a pillow size or bolster length.
9. As a Staff member, I want Template output terminals restricted to **Filling Templates** scoped to the resolved size, so that a graph can never route Size M to a Size L mix.
10. As a Staff member, I want Tier suggestion terminals, so that health answers can advise Premium without changing the sold product.
11. As a Staff member, I want Flow route terminals linking flows (Basic → Premium, Bolster → Basic/Premium), so that upsell and cross-sell are part of the node logic mix.
12. As a Staff member, I want a test panel where I punch in sample answers and watch the fired path light up, so that I can verify logic before publishing.
13. As a Staff member, I want draft and published states with immutable published versions, so that live behavior changes only on a deliberate Publish.
14. As a Staff member, I want Publish blocked with errors pinned on offending nodes (cycles, band gaps/overlaps, unreachable Fallback, non-terminating paths, Flow route without a same-flow fallback sibling, template not size-scoped, input not collected by this flow), so that a broken graph can never run live.
15. As a Staff member, I want to view past published versions read-only and restore one to draft, so that rollback is one action.

### Single authority (engine)

16. As the business, I want online ballpark, in-store suggestion, and basic recommend to evaluate the same published Rule graph, so that surfaces never disagree about size again.
17. As the business, I want seed graphs reproducing today's behavior (in-store XS–XL shoulder bands; Default Filling Templates), so that day-one shopper outcomes are unchanged.
18. As a developer, I want evaluation as a pure, deterministic, I/O-free module, so that recommendations are unit-testable and trustworthy.
19. As an operator, I want every Result to store the graph version, fired terminals, resolved outputs, and evaluation trace, so that any past recommendation is explainable months later.

### Shopper input UX

20. As a shopper, I want measurement inputs to default to inches with a cm toggle, so that they match how Mpillow measures onsite.
21. As a shopper, I want every engine question required with the Continue button blocked on the incomplete step, so that my recommendation derives from my real answers, never invented defaults.
22. As a shopper with no sleep pain, I want an explicit "None" option on pain areas, so that a required multi-select can be answered truthfully.
23. As a shopper unsure how to measure, I want the measurement guides surfaced on the blocking step, so that the required precision does not make me abandon.

### Preview & recommendation

24. As a shopper on the completed "Your Custom Mpillow" preview, I want my recommended size with a plain-language why, so that the recommendation earns trust.
25. As a shopper, I want the recommended filling mix (template name + mix summary) revealed only on the completed preview — after all answers and any upsell are resolved — so that a real answer appears once I have done my part.
26. As a shopper, I want "our specialists confirm every build" copy next to the recommendation, so that expectations about final fillings are honest.
27. As an operator, I want the assign hint upgraded from the size's Default Filling Template to the engine-recommended template with its why, so that review starts from the engine's answer.
28. As an operator, I want guest Results to keep a null filling snapshot until I assign, so that the clinical/ops review gate survives (spatial PRD rule unchanged).
29. As in-store Staff, I want an assist-supplied mix to win over the engine recommendation on the Result, so that live fittings stay authoritative.

### Upsell & cross-sell

30. As a Basic shopper whose answers fire a Premium route, I want an upsell card with the reason and both prices, so that I choose knowingly.
31. As a shopper accepting an upsell, I want my answers carried over and only the missing steps collected (e.g. the three neck measurements), so that upgrading is minimal work, not a restart.
32. As a shopper declining an upsell, I want my Basic result kept and the flow to proceed normally, so that I am never forced.
33. As a shopper, I want all routing resolved before the Stripe page, so that the hold amount matches exactly what I confirmed.
34. As the business, I want entry flow → final flow journeys recorded on the Result, so that upsell conversion is measurable per rule.
35. As an Mbolster shopper cross-sold an Mpillow, I want the card to set expectations about the extra measuring involved, so that the jump is not a surprise.

### Basic & Mbolster

36. As a Basic shopper, I want my size derived from shoulder length and the recommendation to be that size's Default Filling Template, so that Basic stays simple.
37. As an Mbolster shopper, I want my height to derive a length (short/medium/long) and that length's default mix, so that bolster recommendations run through the same engine.

### Visual upgrade

38. As a shopper, I want the recommended mix rendered inside the x-ray pillow visual once the renderer exists, so that I can see inside my pillow.
39. As a developer, I want the preview to reuse the spatial x-ray renderer in read-only mode, so that there is exactly one renderer.

## Implementation Decisions

### Domain & data model

- One **Rule graph** per flow (`premium-mpillow` | `basic-mpillow` | `mbolster`): one editable **draft** plus immutable **published versions** (flow, version number, status, graph JSON, author, timestamps). Publish snapshots the draft as version N+1; restore-to-draft copies a version back into the draft.
- **Node palette v1**: Input, Range, Match, Combine (AND), and terminals — Size output (size or bolster length), Template output (**Filling Template** id, size-scoped), Tier suggestion (advisory only), Flow route (target flow + reason), Fallback. No arithmetic, scoring, loops, sub-graphs, or LLM nodes in v1; the typed node/edge JSON model leaves room for them without schema surgery.
- **Input catalog per flow** is code-defined and typed: Premium = 4 measurements + sleep position, bed firmness, acid reflux, ear discomfort, blood pressure, pain areas, uses bolster, gender, age group; Basic = shoulder + the same customize-step answers; Mbolster = height. A graph may only reference inputs its flow collects. Every input is required — Match nodes have no "not answered" edge.
- **Units**: canonical storage stays cm (existing `*_cm` columns; no data migration). Display and authoring default is **inches** everywhere (configurator tabs and Range node editors), converting on the boundary.
- **Sold tier is flow-scoped.** The graph never changes the held product's tier or price; Tier suggestion renders advisory copy only. Premium flow resolves against premium **Composed sellables** (fixes the online `kind: basic` bug).
- **Publish validation** (blocking): graph is a DAG; all referenced inputs belong to the flow's catalog; Range bands contiguous and non-overlapping over the input domain; every path reaches a terminal; Fallback reachable; Template outputs scoped to the resolved size; every Flow route terminal has a same-flow fallback sibling. Errors pin to nodes on the canvas.

### Evaluation & single authority

- Evaluation is one pure, deterministic, I/O-free TypeScript module: `(published graph, inputs) → { size/length, template id, tier suggestion?, flow route?, fired terminals, trace }`. Runs server-side.
- All recommendation callers — the shop customize ballpark, the in-store response suggestion, and the basic recommend endpoint — evaluate the published graph for their flow. The legacy engines (`SIZE_MAP` body-type map, in-store shoulder-band inference, basic recommend internals) are retired after seeding; mp-maker's legacy `FILLING_SPECS` path is untouched until that surface dies.
- **Bootstrap guard**: while a flow has no published graph, callers fall back to the current hardcoded rules; the guard is deleted once all three flows are seeded.
- **Seeds** (published as v1 per flow, reproducing today's behavior): Premium — in-store shoulder bands (≤36 / ≤40 / ≤46 / ≤52 / >52 cm → XS–XL) → size, neck-trio ranges → that size's **Default Filling Template**; Basic — shoulder bands → size → Default Filling Template, no Flow route wired; Mbolster — height bands → length → that length's Default Filling Template.
- Client-side silent defaults (`shoulder || 40`, neck 8/10/10) are removed; a missing required input is a validation error, never a fabricated recommendation.

### Recommendation record & Result

- Engine output is a **Recommendation record**, not a filling snapshot: graph version id, fired terminals, resolved size/length, recommended template id, tier suggestion, evaluation trace, and entry flow → final flow journey. Written on the response at preview completion and copied to the **Result** at hold create.
- Guest Results keep a **null** filling snapshot until Admin Panel assign (spatial PRD rule unchanged). The assign hint becomes the engine-recommended template (with trace why) instead of only the size's Default Filling Template; the operator still actively confirms.
- **Staff assist mode** precedence: an assist-supplied spatial mix at hold create wins over the engine recommendation.

### Upsell / cross-sell mechanic

- Flow route fires → completed preview shows the shopper's same-flow result **plus an Upsell card**: reason (from the fired path), both prices, Upgrade / Keep buttons. Decline keeps the same-flow fallback result; nothing is forced.
- Accept → shared answers carry over 1:1; the wizard routes to only the missing target-flow steps (Basic → Premium: the three neck measurements; Bolster → Mpillow: the mpillow measurement/customize steps, with the card setting the ~2-minute expectation); the target flow's graph then resolves and the preview re-renders with the target product and price.
- All routing resolves before the Stripe hold; the Result records the journey (entry flow, fired route terminal, final flow).

### Workbench UI

- **Location**: Admin Panel → Landing Site → **Product Builder → Rules Engine** (entry point on the Product Builder page; full page with breadcrumbs, e.g. Product Builder / Rules Engine / Premium Mpillow). Permission: `page-builder`.
- **Canvas**: built on `@xyflow/react` (React Flow) — the one new dependency of this PRD. Node palette, drag-connect edges with type-checked ports, pan/zoom infinite canvas, minimap, version bar (draft / published / history), and the test panel (sample inputs → highlighted fired path + resolved outputs).
- The evaluation engine and validation stay in our pure TypeScript module; React Flow is authoring UI only.

### Preview & configurator changes

- The recommended template (name + plain-language mix summary in v1 text form) is revealed **only** on the completed "Your Custom Mpillow" preview — all required inputs answered, any upsell resolved. Mid-wizard steps never show partial recommendations.
- All engine inputs become required: wizard blocks Continue on the incomplete step (existing hybrid CTA pattern), pain areas gains a "None" chip, measurement steps default to the inches tab, photos remain optional (operator review context, not an engine input).
- When the spatial PRD's x-ray renderer ships, the preview upgrades the text mix summary to the read-only x-ray visual — one designed-in swap point, no fork of the renderer.

## Testing Decisions

- Tests assert **external behavior** (inputs → outputs, persisted rows, rendered signals), never implementation internals.
- Per the ponytail rule, every non-trivial module leaves one runnable check. Prior art: vitest suites in `lib/shop/recommendation/__tests__/` and `lib/results/__tests__/`; `*.check.ts` self-checks run via `npx tsx`.
- Vitest coverage: graph evaluation (each node type, terminal resolution, determinism), publish validation (every blocking rule), seed-equivalence (seeded graphs reproduce the legacy engines' outputs across the input space), answer carry-over mapping, recommendation-record write/copy lifecycle.
- Wiring (workbench mount, caller cutover, preview reveal gating, upsell routing) gets `*.check.ts` self-checks asserting mount points, gating, and API contracts.
- The workbench test panel doubles as the human-runnable check for authored graphs.

## Out of Scope

- LLM nodes or LLM-driven recommendations (existing optional LLM hooks stay dormant; node ids remain aligned).
- Arithmetic/formula nodes, weighted scoring, loops, sub-graphs, OR-combinators (Match branches cover disjunction).
- Shopper-facing filling editing or shopper-visible raw BOMs — recommendations only; fillings stay template/operator/Staff territory.
- Automatic tier or product switching without shopper consent; the graph never changes the held price on its own.
- mp-maker legacy path (`FILLING_SPECS` retained there until that surface dies).
- Banded/quiz-style measurement inputs or camera/3D scanning — exact measurements are the brand.
- A/B testing or multiple concurrently published versions per flow.
- Editing filling shapes/colors here (Product Builder's other tabs own presentation).
- Changes to the hold/capture money mechanics or the spatial snapshot lifecycle.

## Further Notes

- Brand language: **Mpillow** / **Mbolster** in all UI copy; back-office actors are **Staff**.
- Dependency on the spatial PRD: **soft on slice 1** (Template outputs reference Filling Templates, which work in legacy-flat or spatial form) and **hard on slice 7 only for the x-ray preview upgrade** (slice 07 here). Everything else ships independently, with the text mix summary as the interim visual.
- The spatial PRD's Product Builder page gains the Rules Engine entry point (cross-referenced in its slice 10).
- Decision provenance: 13 grill decisions from the Jul 19 2026 session; the plan is archived at `.cursor/plans/rules_engine_prd_&_docs_fb417718.plan.md`.
