# The landing page's sub pages are edited as overrides over code-defined sections

Status: Accepted (2026-11-05). Lifts the "Any page other than the landing page" exclusion in
`.claude/PRD-page-builder-redesign` and the "settings UI for product sections (not now)" note in
`.claude/PRD-product-slide-sections`, for the learn-more slide-ins only.

The Page Builder edited the landing page alone. The six sheets that page opens — Size Matters,
Ambassadors, Basic Mpillow, Premium Mpillow, Cervical Neck Support and Mbolster — were code: four
were already composed from **Product section templates** by a typed config, and Size Matters and
Ambassadors were hand-built. Staff asked to edit them in the Page Builder too.

## Decision

**A sub page's sections stay code; Staff edit an override layer over them.**

- The **Product slide section config** is still the catalog. It alone decides which sections a
  sub page has, and each entry now carries a stable `key`. A `slide_in_sections` row adjusts one
  section — its position, its visibility, and a `content` of copy and media overrides — and a
  section with no row renders exactly as the code says. An empty table is today's sheets.
- Staff **reorder, hide and edit**; they do not add or remove sections. The templates' layouts are
  code, and a section Staff could delete is one a later code change could not rely on.
- The sheet **header** (title and the line under it) is a pinned pseudo-section, editable but
  never moved or hidden.
- **Copy is stored per locale as a whole record** (`content.copy["en-US"]`, `content.copy["zh-CN"]`),
  not as a locale map on every leaf the way Landing sections store it. Slide-in copy is mostly
  lists and cards, and a list of per-string locale maps cannot say "Chinese has three
  paragraphs, English four". A locale with nothing stored falls back to its i18n default.
- **Media is shared** by both locales (`content.media`), as the config's media is. Image lists are
  replaced slot by slot and never grow, so a carousel can never have more cards than images.
- Each template declares which fields are editable (`lib/slide-in-pages/fields.ts`); an override
  for any other key is ignored at render. Not editable here: prices (Costings is their source),
  the size/shoulder chart (fit data), firmness percentages and measurement icons.
- **Draft, Publish, Discard and History work per sub page**, exactly as for the landing page:
  nullable draft columns on the row, one database function per action, a bounded
  `slide_in_page_publishes` history whose restore stages a draft. Publishing one sub page never
  touches another or the landing page.
- **Preview mode** is `/page-builder-preview/<page>`, rendering the sheet's body through the same
  `SlideInPageSections` component the live sheet uses.
- **Live delivery** is from the root layout: the slide-ins open from any page (the app dock carries
  three), so every sub page's published rows are read once per request through `unstable_cache`
  (tag `slide-in-sections`, invalidated by Publish and by Replace everywhere) and provided to the
  client. A failed read renders the code defaults rather than failing the site.

Size Matters and Ambassadors moved onto the templates to be editable at all. Three templates were
added for what they showed (`press_quote`, `measure_carousel`, `typed_quote`) and two options on
existing ones (`split_hero` with a natural-aspect image or a collapsible list; `video_section`
side by side). A test checks every string and image they showed still renders.

## Consequences

- Adding a section in code needs no migration: it appears at its config position. Renaming a
  section's `key` orphans its Staff edits, so a key is treated like a database key.
- A Staff override cannot break a template's layout: unknown keys are dropped, blank fields fall
  back, image hosts are checked at write, video ids must be ids, and copy passes the banned
  clinical-claims check (strings identical to the i18n default are not re-gated).
- Images in sub-page overrides, drafts included, count as **Used** in the Media library and are
  rewritten by Replace everywhere.
- Every page's layout now reads one cached query. Its payload is the overrides only, and only the
  published ones.
- The Mbolster purchase panel's price and the Premium price table are still literals in their
  configs, not Costings reads. They stay non-editable here; moving them onto Costings is separate
  work.
