# PRD: UX Polish — Configurators, Landing, Admin (Jul 2026)

Status: Draft (needs-triage)
Source: Product / UX feedback session (Jul 2026)
Branch prefix: `cursor/ux-polish-*`

## Problem Statement

After recent configurator mobile UX, dock, and marketing work, several small but high-friction gaps remain on real devices:

1. **Mpillow configure** — Authorization hold / Stripe path still needs a verification pass; the exit confirmation still shows a redundant corner **X** when Stay/Exit already cover dismiss.
2. **Mbolster customise** — FAQ (i) dialog close is fixed in the wrong place on mobile; height field fights the soft keyboard; the preview still offers **covers** even though Mbolster inventory / Configure does not sell covers as a Customer preference (case only).
3. **Landing** — Profile control sits in the right cluster with language/theme instead of the left; hero CTAs compete with the product image on mobile instead of sitting on the bottom edge.
4. **Science of Sleep** slide-in — “How do we adjust Mpillow accurately for you?” measurement cards do not stack cleanly on narrow viewports.
5. **Global mobile chrome** — Extra bottom padding leaves a dead zone; the app dock does not reliably reappear when the user reaches the end of the page; pages can still pinch-zoom and horizontally overflow.
6. **Admin Panel** — Settings surfaces need a mobile UX pass (buttons, cards, stacking); Orders date range is sent from the UI but not applied to list/dashboard APIs, so staff cannot generate a sales report for a period.

None of these require a domain rewrite. They are vertical, demoable polish slices across storefront, configurator, and Admin Panel.

## Solution

Ship thin vertical slices that each leave a runnable proof:

| Surface | Outcome |
|---------|---------|
| Mpillow config | Stripe hold path verified (or fixed); exit dialog has Stay/Exit only — no corner X |
| Mbolster config | FAQ close sits below FAQ content (scrolls with content on mobile); height accepts keyboard input; preview Customer preference matches inventory (case, no cover picker when covers are not offered) |
| Landing header + hero | Profile on the left of the expanded header; mobile hero CTAs bottom-aligned so product image reads larger |
| Science of Sleep | Measurement cards stack / reflow without overlap or horizontal page scroll |
| Dock + padding | Reduce excess bottom padding; dock visible when scrolled to page end |
| All mobile pages | No pinch-zoom; no page-level side scroll; components stack |
| Settings | Mobile-friendly buttons/cards/interactions across Admin Panel pages |
| Orders | Date-range filter drives list + summary so staff can report sales for a period |

## User Stories

### Mpillow configuration

1. As a visitor authorizing an Mpillow customisation, I want Stripe Checkout / Authorization hold to complete or cancel correctly, so that payment is trustworthy.
2. As a visitor who cancels or returns from Stripe, I want to land back on preview with my choices when cancel restore already applies, so that retry is one tap.
3. As a mobile visitor opening the exit confirmation, I want Stay and Exit only — no corner X — so that dismiss affordances are not duplicated.
4. As a desktop visitor, I want exit behavior unchanged unless the same dialog is reused, so that desktop is not redesigned for free.

### Mbolster customise

5. As a mobile visitor opening the Mbolster (i) FAQ dialog, I want the close control below the FAQ accordion (in document flow), so that I am not fighting a fixed overlay with the keyboard or accordion.
6. As a visitor entering height, I want to type decimal values with the soft keyboard without the field losing focus, jumping, or blocking input, so that I can complete the height step.
7. As a visitor on Mbolster preview, I want only the Customer preferences that inventory / Configure actually offers (no cover picker if Mbolster has no covers), so that the flow matches the product.
8. As an operator in Configure / inventory, I want bolster BOM / preference categories to match what the customise API returns, so that empty or wrong pickers are not a silent data bug.

### Landing

9. As a signed-in Customer on the landing header, I want the Profile control on the left side of the top bar, so that brand stays centered and utilities stay scannable.
10. As a guest, I want header layout still balanced when Profile is absent, so that language/theme do not jump oddly.
11. As a mobile visitor on the hero, I want Customise and Book appointment CTAs aligned to the bottom of the hero plane, so that more of the product image is visible above them.

### Science of Sleep

12. As a mobile visitor in “How do we adjust Mpillow accurately for you?”, I want measurement cards to stack or reflow without overlapping content, so that each measure is readable.
13. As a visitor on that section, I do not want the page behind the sheet to side-scroll because of card width, so that the slide-in stays contained.

### Dock / padding / viewport

14. As a mobile visitor scrolling a marketing page, I want less empty bottom padding, so that content feels closer to the dock.
15. As a mobile visitor who reaches the end of the page, I want the app dock visible, so that Home / configs remain reachable without scrolling up first.
16. As a mobile visitor on any page, I do not want pinch-zoom changing the layout, so that UI stays calibrated.
17. As a mobile visitor, I do not want horizontal page scrolling, so that stacked layouts stay one column.

### Settings / Orders

18. As Staff on Admin Panel pages on a phone, I want buttons, cards, and filters to be tappable and stacked without overflow, so that ops work is possible on mobile.
19. As Staff on Orders, I want to pick a date range and see matching orders and sales summary, so that I can generate a period sales report.
20. As a developer, I want Orders list + dashboard APIs to honor `date_from` / `date_to`, so that the existing UI filters are not no-ops.

## Implementation Decisions

### Modules

| Module | Responsibility |
|--------|----------------|
| **Exit dialog chrome** | `ConfiguratorExitDialog` / `DialogContent`: `hideClose` (or equivalent) so Stay/Exit are the only dismiss controls |
| **Stripe hold verify** | Staging checklist + fix only if hold create / cancel restore / capture path fails; reuse existing `hold-cancel-restore` and `/api/results/hold` |
| **Mbolster FAQ dismiss** | Match Mpillow FAQ pattern: `hideClose` + inline `OverlayDismissButton` below `PageFaqAccordion` (not corner-fixed) |
| **Height keyboard** | Height step: focus/scroll/`visualViewport` (or simpler input attrs) so decimal `inputMode` typing works on iOS/Android |
| **Bolster preferences** | Align `getAvailableBolsterComponents`, customise API, and preview UI with Configure: no cover Customer preference when covers are not offered; case (`bolster_case`) remains |
| **Landing header** | `home-header.tsx`: Profile left column; logo center; language/theme right |
| **Hero CTA band** | Mobile: CTAs pinned to bottom of hero overlay; keep clearance token; do not shrink product visibility with mid-hero CTA stacks |
| **Size-matters cards** | Measurement carousel / tiles: mobile stack or single-column; fix `MeasureTile` / card min-widths that force overflow |
| **Dock end-of-page** | `app-dock.tsx` scroll policy: show dock when near document bottom (in addition to scroll-up / top) |
| **Bottom clearance** | Trim excess `pb` / `--mobile-bottom-clearance` usage on marketing footer/hero where double-padding stacks |
| **Viewport lock** | Root `viewport` export: `maximumScale: 1` (and related) for mobile; audit overflow offenders |
| **Orders date report** | Wire `date_from`/`date_to` in `/api/shop/orders` + dashboard; refresh summary on range change |

### Technical clarifications

1. **Mbolster covers:** Domain language keeps Customer preference = cover + case for pillows. Product feedback: Mbolster does **not** offer covers. Prefer fixing inventory/API/UI to case-only for bolster customise rather than inventing cover SKUs. Confirm against Configure BOM tabs (`bolster_case`, etc.) before deleting UI.
2. **Exit X:** Applies to the **exit confirmation dialog**, not necessarily every OverlayDismiss elsewhere. Welcome FAQ / other dialogs keep their own patterns unless a slice says otherwise.
3. **Profile left:** Expanded (non-compact) sticky header only. Compact scroll dock stays Online / In-Person / WhatsApp. Do not add a second Profile to the landing app dock (CONTEXT.md).
4. **No zoom:** Prefer Next.js `viewport` metadata over ad-hoc meta tags. Document iOS accessibility tradeoff in the issue (intentional product choice).
5. **Orders report:** “Generate report” = filtered list + summary cards for the range in v1; CSV export is out of scope unless trivial. Analytics page already has richer date UX — reuse patterns, do not duplicate a second analytics product.
6. **No new CONTEXT.md terms / no ADR** unless bolster preference model change needs a one-line glossary note (case-only for bolster).

### Schema / API

- Orders: filter `created_at` (or paid-at — pick one and document) by `date_from` / `date_to` on list + dashboard.
- Bolster customise: likely no migration; category filter / UI gating only. If Configure wrongly lists covers for bolster, fix Configure item filters in the same slice.

## Testing Decisions

| Module | Automated? | Rationale |
|--------|------------|-----------|
| Orders date filter (API) | **Yes** | Query param → SQL/filter — high regression risk |
| Bolster preference role / inventory mapping | **Yes** | Small pure helper or inventory filter check |
| Hold-cancel restore (if touched) | **Yes** | Existing check file |
| Exit dialog hideClose | **No** | Visual; staging |
| Height keyboard | **No** | Device-only |
| Header / hero / cards / dock | **No** | Visual/device |
| Viewport / overflow | **No** | Device matrix |

### Prior art

- `.claude/PRD-configurator-mobile-ux/` — exit dialog, Stripe cancel restore
- `.claude/PRD-modal-safe-area/` — sheet safe-area
- `.claude/PRD-dock-unified-sign-in/` — Profile vs Sign in vs Admin Panel
- `.claude/PRD-money-flow-traceability/` — Orders / analytics money surfaces
- ADR `0002-authorize-then-capture-customised-goods.md`

## Out of scope

- Redesigning desktop exit to dialog
- New Mbolster demographic questions
- CSV/PDF export for Orders (unless already half-built)
- Adding Profile to the landing dock
- Marketing copy rewrites (separate PRD)
- Shopify sync redesign (Orders Shopify tab date refresh stays as today unless needed for the report)

## Success metrics

- Staging checklist passes for Mpillow hold + Mbolster height + FAQ close on iOS Safari and Android Chrome
- Mbolster preview never shows an empty/wrong Cover Style block when covers are not offered
- Landing mobile hero shows product above CTAs; Profile left on signed-in header
- Science of Sleep cards readable without horizontal page scroll
- Dock visible at page bottom; no pinch-zoom; no page side-scroll on audited routes
- Orders date range changes list counts and summary cards
