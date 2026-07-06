# PRD: Product Slide-In Section Templates

Status: Draft (needs-triage)
Source: Grill-with-docs session (Jul 2026) + `CONTEXT.md` Marketing glossary

## Problem Statement

The learn-more slide-ins for Basic Mpillow, Premium Mpillow, Mbolster, and Cervical Neck Support are implemented as large, monolithic React files with duplicated inline layout markup. The same patterns (text+image split, feature carousel, firmness block, spec table, video embed) are reimplemented with slightly different class names and structure in each file.

This makes the slide-ins hard to maintain, hard for agents to extend consistently, and impossible to reuse as composable blocks without copy-paste. Basic Mpillow has the best layout patterns, but they are not extracted for Premium, Mbolster, or Cervical to share.

Operators and customers still need the same product stories, images, and CTAs — only the inner section layout should improve. Landing pages, homepage page builder, and customisation wizards must not change.

## Solution

From the visitor's perspective, nothing about how they open a learn-more slide-in changes (same CTAs from the landing page, app dock, and Premium accessory link). Inside the sheet, content reads clearer with consistent spacing and modern DTC product-story flow, but **all existing copy, images, and videos are preserved**.

From the developer/agent perspective:

1. Extract **product section templates** — dumb layout components that receive JSON-serializable content props (no product copy inside the component).
2. Define a **typed config + renderer** per slide-in: an ordered array of `{ type, contentKey, …mediaProps }` resolved against `m.slides.*` i18n.
3. Keep the **slide-in shell unchanged** (sticky header, progress bar, sticky footer CTAs).
4. Follow **approved section recipes** per product; reorder is allowed, deletion is not.
5. Publish an **agent playbook** (markdown catalog) alongside TypeScript types so future work (including optional settings drag/edit) can compose sections without rewriting layout code.

## User Stories

1. As a visitor on the homepage, I want to tap "Learn more" on Basic Mpillow and see the same product story with improved layout, so that I can decide whether to customise without losing information.
2. As a visitor, I want to tap "Learn more" on Premium Mpillow and see the full premium story (in-store customisation, overseas flow, pricing, measurements, warranty), so that I understand the tier before starting `/mp-config`.
3. As a visitor, I want to tap "Learn more" on Mbolster and see gallery, pricing, size/case options, and benefits, so that I can choose a bolster confidently.
4. As a visitor on Premium, I want to open Cervical Neck Support from the accessory section and see the full accessory story, so that I understand the add-on before booking or customising.
5. As a visitor on the neck-pains landing section, I want the Cervical Neck Support learn-more CTA to open the same refactored slide-in, so that the experience is consistent (landing page markup itself unchanged).
6. As a visitor, I want sticky footer CTAs (Customise, Book appointment, Back) to behave exactly as today, so that my path to purchase or support is unchanged.
7. As a visitor reading in Chinese, I want all slide-in content to remain localized via existing i18n, so that nothing regresses for `zh-CN`.
8. As a marketing operator, I want section order to follow a decision-oriented flow (hook → benefits → proof → specs), so that cold traffic converts better without rewriting copy.
9. As a marketing operator, I want Premium to show a trust strip (washable, warranty, in-store custom, readjustment) near the top, so that objections are addressed early.
10. As a marketing operator, I want Mbolster's repetitive title+image blocks consolidated into a feature carousel where approved, so that the scroll story is tighter without dropping content.
11. As a developer, I want one `ProductSlideSectionRenderer` that maps section type → component, so that slide-in files are thin shells plus config.
12. As a developer, I want each template type to declare a TypeScript content interface, so that i18n keys are compile-time checked against expected shapes.
13. As a developer, I want media assets (image paths, video IDs) in config—not i18n—so that translatable copy stays separate from assets.
14. As a developer, I want a `product_slide_section` wrapper with consistent padding, so that agents never hand-roll `px-4 md:px-6` variants.
15. As a developer, I want to reuse `LeftContentRightImgSection` patterns via a `split_hero` template, so that Basic's best layout becomes the default block.
16. As a developer, I want `feature_carousel` to unify Basic and Premium carousel card markup, so that one card component serves both products.
17. As a developer, I want complex interactive sections (Mbolster purchase panel, Premium measurement grid) as named components referenced by config type, so that stateful UI is not forced into generic prop blobs.
18. As a developer, I want content objects to be JSON-serializable, so that a future settings page builder can store `{ type, content }` rows like `landing_sections` without rewriting templates.
19. As an agent authoring new product stories, I want a markdown catalog listing template IDs, content schemas, and recipes, so that I can plug sections without reading three slide-in files.
20. As an agent, I want adding a new product slide-in to mean a new config file + i18n block—not a new 500-line TSX file.
21. As a developer, I must not modify landing page components, homepage page builder, or `landing_sections` data as part of this work, so that homepage releases stay isolated.
22. As a developer, I must not change slide-in shell chrome (header title/description, progress bar, close button, sticky footer structure), so that UX muscle memory is preserved.
23. As a developer, I must not delete or omit any existing i18n copy, images, videos, or tables during refactor, so that content parity is guaranteed.
24. As a developer, I want unused i18n keys (e.g. Cervical `bottomViewSource`) preserved—wired to UI if appropriate or left in locale files, so that no copy is lost.
25. As a developer, I want Premium's `trust_strip` i18n added for new section content synthesized from existing premium messaging, so that the new section has proper translations in both locales.
26. As a visitor on mobile, I want carousels to remain horizontally swipeable, so that feature discovery matches DTC best practice.
27. As a visitor, I want images to keep reserved aspect ratios, so that layout does not shift while loading.
28. As a developer, I want the Basic slide-in refactored first to prove the template set, so that Premium/Mbolster/Cervical reuse proven blocks.
29. As a developer, I want Cervical Neck Support to remain a nested sheet opened via the existing event API, so that Premium and neck-pains CTAs keep working.
30. As a developer, I want Cervical's footer to remain "Back" (not Customise), so that nested navigation semantics stay correct.
31. As a finance stakeholder, I want pricing tables and "from" prices in slide-ins to show the same numbers as today, so that MSRP messaging is unchanged.
32. As a developer, I want firmness comparison blocks to keep using `FirmnessScale`, so that visual language stays consistent across tiers.
33. As a developer, I want YouTube embeds to keep using `YouTubeAutoplayOnView`, so that video behavior is unchanged.
34. As a product owner, I want future settings drag/edit for product slide-ins to be feasible without a rewrite, so that templates are reusable code blocks today.
35. As a developer, I want a small module test proving config → content resolution for at least one template type, so that regressions in the renderer are caught early.

## Implementation Decisions

### Scope boundary

- **In scope:** Inner content sections of four learn-more slide-ins (Basic, Premium, Mbolster, Cervical Neck Support).
- **Out of scope:** Landing page sections, `/mbolster` standalone page, `/mp-basic` / `/mp-config` wizards, settings UI, database tables, shell chrome redesign.

### Architecture (hybrid C)

| Layer | Responsibility |
|-------|----------------|
| **Product section templates** | Presentational components in a dedicated product-sections area; props = serializable content + media; no `m.slides` imports inside templates |
| **Content schemas** | TypeScript interface per template type (`SplitHeroContent`, `FeatureCarouselContent`, etc.) |
| **Section config** | Per-product ordered arrays: `{ type, contentKey?, flip?, image?, images?, videoId?, … }` |
| **Renderer** | Resolves `contentKey` from `m.slides.{product}`, merges config media props, dispatches to template or complex component |
| **Complex components** | `PurchasePanelSection`, `MeasurementGridSection` — referenced by type in config; own local state |
| **Slide-in shell** | Existing Sheet wrapper, progress scroll, sticky footer — unchanged; inner body becomes `<ProductSlideSectionRenderer sections={…} messages={…} />` |
| **Agent catalog** | Markdown playbook mirroring types: template IDs, schemas, recipes, rules |

Content shapes should mirror future JSONB rows (`{ section_type, content, position }`) even though storage is code-only for now.

### Approved section recipes

**Basic Mpillow:** `split_hero` → `firmness_compare` → `feature_carousel` → `size_guide_split` → `video_section`

**Premium Mpillow:** `split_hero_dual_media` → `trust_strip` → `split_hero`(overseas) → `icon_list` → `feature_carousel` → `firmness_compare` → `split_hero`(accessory) → `spec_table` → `measurement_grid` → `packaging_block` → `video_section`(customisation) → `video_section`(aftercare) → `commitment_cards` → `help_contact`

**Mbolster:** `purchase_panel` → `split_hero`(about) → `size_guide_split` → `packaging_block` → `outcome_grid` → `testimonial_card` → `feature_carousel`(story) → `split_hero`(discover)

**Cervical Neck Support:** `media_intro` → `split_hero`(why) → `full_bleed_media`(comparison) → `feature_card_grid`(benefits) → `text_callout_block`(difference)

### Template catalog (v1)

| Template type | Role |
|---------------|------|
| `product_slide_section` | Wrapper only — padding, optional border-top |
| `split_hero` | Text + optional bullets/CTA \| image; flip support; extends current `LeftContentRightImgSection` behavior |
| `split_hero_dual_media` | Full-width hero + 2-col text/media (Premium opener) |
| `full_bleed_media` | Wide comparison or hero image only |
| `media_intro` | Full-width image then eyebrow + title + description |
| `trust_strip` | 3–4 icon/label trust items in a row |
| `icon_list` | Title, intro, bullet list, optional conclusion |
| `feature_carousel` | Horizontal swipe cards — unified card component |
| `feature_card_grid` | Static 1×3 (responsive) benefit cards with optional images |
| `firmness_compare` | Text + one or two `FirmnessScale` bars |
| `spec_table` | Title + table + footnotes |
| `size_guide_split` | `split_hero` variant with embedded size table |
| `video_section` | Title, optional description, YouTube embed |
| `packaging_block` | Title, optional image, bullet list, callout note |
| `outcome_grid` | 2×2 benefit tiles |
| `testimonial_card` | Quote, attribution, optional rating breakdown + photo |
| `text_callout_block` | Paragraphs + bordered bullet callout |
| `commitment_cards` | Stacked warranty/readjustment cards + optional image |
| `help_contact` | Title + contact line |
| `purchase_panel` | **Complex** — gallery, price, selectors, CTAs (Mbolster) |
| `measurement_grid` | **Complex** — 4-step measurement cards with images (Premium) |

Landing layout components may inspire markup but must not be modified; product templates are separate components.

### Deep modules (small surface, testable)

| Module | Responsibility |
|--------|----------------|
| **`resolve-slide-content`** | Given `contentKey`, product messages object, and schema type — return typed content or throw at dev time; pure |
| **`product-slide-renderer`** | Map `type` → component; merge resolved content + config media props |
| **`feature-carousel-items`** | Map i18n feature array + parallel image list → carousel item props; pure |

Prefer pure resolvers over embedding i18n logic inside every template.

### i18n

- All copy stays in `m.slides.basicMpillow`, `premiumMpillow`, `mbolster`, `cervicalNeckSupport`.
- Add `trust_strip` items under `premiumMpillow` (both `en-US` and `zh-CN`).
- Reshape i18n only when needed to satisfy content schemas (e.g. nest hero fields)—never delete keys; migrate content into schema-shaped objects.
- `bottomViewSource` on Cervical: wire to footer or preserve key—do not remove.

### Content preservation checklist (per slide-in)

Before merge, verify parity against current production slide-in:

- Every paragraph, list item, table row, image `src`, `videoId`, CTA `href`, and selector option still present.
- Footer actions unchanged.
- Open triggers unchanged (Sheet trigger, controlled open, cervical event).

### Future settings (not built now)

Templates and `{ type, content }` shapes are designed so a later `product_slide_sections` table + settings editor can reuse the same renderer. No migration or admin UI in this PRD.

## Testing Decisions

**What makes a good test:** assert externally visible behavior — resolved content shape, renderer dispatch for known types, carousel item count matches i18n features — not CSS class names or snapshot entire sheets.

| Module | Test | Prior art |
|--------|------|-----------|
| `resolve-slide-content` | `contentKey` resolves nested i18n; missing key fails loudly in dev | `lib/i18n` patterns |
| `feature-carousel-items` | N features + N images → N carousel items | — |
| Renderer dispatch | Unknown `type` throws or warns; known type renders without error in isolation | — |

**Not required for v1:** Visual regression, E2E Playwright on sheets, landing page tests.

**Manual test plan (per slice):** Open slide-in from landing CTA → scroll full content → confirm images/videos load → tap footer CTA → for Cervical, open from Premium accessory → Back closes.

## Out of Scope

- Landing page or `components/sections/landing/` changes.
- Homepage page builder / `landing_sections` DB.
- Standalone `/mbolster` marketing page redesign.
- `/mp-basic`, `/mp-config`, `/mbolster-config` wizard changes.
- Settings admin UI for drag/edit product sections.
- New product photography or copywriting (layout only).
- Slide-in shell redesign (header, progress, footer chrome).
- SEO, analytics, or routing changes.
- Deleting or shortening existing content.

## Further Notes

- Basic Mpillow is the extraction prototype; build order: foundation → Basic → Premium → Cervical → Mbolster (Cervical and Mbolster can parallel after Basic).
- Premium recipe adds `trust_strip` — new i18n synthesized from existing warranty/washable/in-store themes.
- Mbolster consolidates five similar `media_stack` sections into `feature_carousel` + closing `split_hero`; all images and copy must appear in the carousel or discover section.
- `CONTEXT.md` Marketing glossary already documents recipes and constraints; keep in sync when implementation lands.
- DTC layout research informed recipe ordering (benefits before price, trust early, carousel over repetitive stacks); see grill session notes.
