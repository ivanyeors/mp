# PRD: Page FAQ Embeds + Answer Lede Coverage

Status: Draft (needs-triage)
Source: Grill-with-docs session (Jul 2026) + plan `faq_embeds_aeo` + AEO recommendations (dedicated FAQ blocks, TL;DR summaries)

## Problem Statement

AI answer engines and buyers both rely on clear Q&A and short extractable summaries on commercial pages. Mpillow already has a strong Global FAQ (`/faq` with CMS, accordion, and `FAQPage` JSON-LD), Editorial hubs with FAQs, and an **Answer lede** pattern for AEO — but the money pages do not embed page-relevant Q&A:

- Homepage has no FAQ section in the landing page builder.
- **Storefront product** PDPs have no FAQ block or product-scoped `FAQPage` schema.
- Configurator **SEO shells** (`mp-config`, `mbolster-config`) have answer ledes but no FAQ embeds.
- Industry “TL;DR” guidance overlaps the existing **Answer lede**; some commercial surfaces still have weak or missing `seo_answer` coverage.
- Operators cannot manage page-local FAQs in Settings without hardcoding; the existing `/settings/faq` UI only covers Global FAQ and needs a redesign to support Page FAQs cleanly.

Without page-local FAQs on ranking URLs, AI engines under-extract buyer prompts (e.g. “What’s the difference between a cervical and an ergonomic pillow?”) from the pages that should convert.

## Solution

From a **searcher / AI assistant** perspective: home, PDPs, and configurator pages each expose a compact, page-relevant FAQ accordion with crawlable answers and `FAQPage` JSON-LD, plus a solid **Answer lede** under the H1.

From an **operator** perspective: one redesigned `/settings/faq` with **Global FAQ** and **Page FAQs** tabs. Page FAQs are edited per **FAQ surface** (home, configurators, or a specific product). Home placement is controlled in the page builder; PDPs and configurators auto-show when the surface has visible items.

From a **developer** perspective:

1. Treat industry “TL;DR” as the existing **Answer lede** — no second summary UI.
2. Store Page FAQs separately from Global FAQ (`faq_page_sets` / `faq_page_items` keyed by `surface_key`).
3. Ship a reusable public Page FAQ section (accordion + JSON-LD).
4. Wire home (page-builder `faq` section), PDPs, and configurator SEO shells.
5. Redesign Settings FAQ admin for the dual model.
6. Seed bilingual starter Q&As for home, configs, and main PDPs; audit/fill answer ledes on those same surfaces.
7. Document **Page FAQ**, **FAQ surface**, and the TL;DR → Answer lede alias in `CONTEXT.md`.

## User Stories

### Domain and glossary

1. As a developer, I want **Page FAQ** and **FAQ surface** defined in `CONTEXT.md`, so that agents and operators use consistent vocabulary.
2. As a developer, I want industry “TL;DR” documented as an alias of **Answer lede**, so that we do not build a duplicate summary pattern.
3. As a developer, I want Global FAQ kept distinct from Page FAQs, so that warranty/shipping catalog items do not collide with page-specific Q&A.

### Answer lede (TL;DR)

4. As a homepage visitor, I want a clear **Answer lede** under the hero H1, so that I get a direct brand/product answer immediately.
5. As a PDP visitor, I want an **Answer lede** under the product H1, so that humans and AI get fact-dense context first.
6. As a visitor on `mp-config`, I want an **Answer lede** in the SEO shell, so that customisation intent is answered before the wizard.
7. As a visitor on `mbolster-config`, I want an **Answer lede** in the SEO shell, so that bolster intent is answered before the wizard.
8. As a marketing operator, I want to edit product `seo_answer` per locale in product settings, so that PDP ledes stay CMS-managed.
9. As a marketing operator, I want home and configurator ledes filled or improved where weak, so that commercial surfaces meet AEO density without a new UI.
10. As a search engine / AI crawler, I want answer ledes in the initial HTML, so that extraction does not depend on client-only UI.

### Page FAQ — public experience

11. As a homepage visitor, I want a FAQ section on the landing page when ops place it, so that common buyer questions are answered without leaving home.
12. As a homepage visitor, I want FAQs in a compact accordion matching landing section rhythm, so that the page stays scannable.
13. As a PDP visitor, I want product-relevant FAQs when that product’s Page FAQ set has visible items, so that care, fit, and difference questions are on the ranking URL.
14. As a PDP visitor, I want the FAQ block hidden when the product has no visible Page FAQs, so that empty chrome does not appear.
15. As a visitor on `mp-config`, I want customisation-relevant FAQs below the SEO intro when configured, so that process questions are answered on the conversion URL.
16. As a visitor on `mbolster-config`, I want bolster-relevant FAQs when configured, so that the same pattern applies to bolster commercial intent.
17. As a visitor reading a Page FAQ answer, I want the answer text present in the HTML even when the accordion is collapsed, so that crawlers can extract Q&A.
18. As a search engine, I want `FAQPage` JSON-LD on home / PDP / configurator URLs that show Page FAQs, so that rich results and AI citation can use structured Q&A.
19. As a visitor who needs more help, I want a link from Page FAQ blocks to Global FAQ (`/faq`), so that I can browse the full catalog.
20. As a bilingual visitor, I want Page FAQ questions and answers in my locale (`en-US` / `zh-CN`), so that embeds match the rest of the site.
21. As a visitor, I want Page FAQ answers to support simple markdown where Global FAQ does, so that links and emphasis work consistently.

### Page FAQ — operator / Settings

22. As a marketing operator, I want `/settings/faq` redesigned with **Global FAQ** and **Page FAQs** tabs, so that one place owns all FAQ content.
23. As a marketing operator, I want to pick an **FAQ surface** (home, mp-config, mbolster-config, or a product), so that I edit the right list.
24. As a marketing operator, I want to add, edit, reorder, show/hide, and delete Page FAQ items per surface, so that I control page Q&A without code deploys.
25. As a marketing operator, I want bilingual fields for each Page FAQ item, so that en-US and zh-CN stay in sync with Global FAQ editing habits.
26. As a marketing operator, I want Global FAQ categories and items to keep working as today, so that `/faq` is not regressed by the redesign.
27. As a marketing operator, I want clear empty states and a preview link for the selected surface, so that I know what visitors will see.
28. As a marketing operator, I want starter bilingual Page FAQs seeded for home, configurators, and main shop PDPs, so that AEO works on day one and I can refine copy later.
29. As a marketing operator, I want to create Page FAQ sets for additional products from Settings, so that new **Storefront products** can get embeds without a migration.
30. As a page-builder operator, I want a `faq` landing section type that renders the `home` Page FAQ set, so that I control placement on the homepage stack.
31. As a page-builder operator, I want FAQ section content owned by Settings (not duplicated in section JSON), so that I do not edit the same Q&A in two places.
32. As a page-builder operator, I want the home FAQ section to render nothing useful (or a quiet empty state in admin preview) when the home set is empty, so that an accidental section does not show a broken block.

### APIs, permissions, and integrity

33. As a developer, I want authenticated admin APIs for Page FAQ sets and items (CRUD + reorder), so that Settings can persist changes safely.
34. As a developer, I want Page FAQ admin gated by the same permission model as Global FAQ / page-builder, so that access control stays consistent.
35. As a developer, I want `surface_key` validation (`home` | `mp-config` | `mbolster-config` | `product:{uuid}`), so that invalid surfaces cannot be stored.
36. As a developer, I want Page FAQ tables independent of `faq_categories` / `faq_items`, so that Global FAQ schema stays stable.
37. As a developer, I want lazy seed-when-empty for Page FAQ defaults (same spirit as Global FAQ), so that fresh environments get starter content.
38. As an AI crawler, I want existing `/api/faq` and `/faq` Global FAQ behavior unchanged, so that llms.txt and current integrations keep working.

### Quality and verification

39. As a developer, I want a runnable self-check for the Page FAQ store (seed bilingual completeness, surface_key rules, schema text stripping), so that seed regressions fail fast.
40. As a marketing operator, I want to verify one home and one PDP URL in Google Rich Results for `FAQPage`, so that structured data is valid in production-like conditions.

## Implementation Decisions

### Approved design decisions (grill session)

| Decision | Resolution |
|----------|------------|
| TL;DR | Alias of **Answer lede**; no new summary component |
| Surfaces | Home + PDPs + `mp-config` / `mbolster-config` SEO shells |
| Content ownership | Page-local, CMS-editable (not hardcoded TS like guide hubs) |
| Settings UX | Extend `/settings/faq` with Page FAQs; redesign Settings FAQ UI only |
| Public `/faq` | Unchanged visual design in this PRD |
| Data model | Separate `faq_page_sets` + `faq_page_items`; `surface_key` unique per set |
| Public UI | Compact accordion + `FAQPage` JSON-LD; answers in DOM |
| Appearance | Home = page-builder `faq` section; PDPs & configurators = auto when ≥1 visible item |
| Answer lede work | Audit + fill gaps on those commercial surfaces only |
| Seed | Bilingual starters for home, configs, main PDPs |
| Guides / blogs / slide-ins | Out of scope for embeds |

### Modules

| Module | Responsibility |
|--------|----------------|
| **Page FAQ store** | Schema, surface_key parse/validate, get-by-surface, CRUD, reorder, bilingual seed, lazy seed-when-empty |
| **Page FAQ section (public)** | Compact accordion, heading, optional link to Global FAQ, `FAQPage` JSON-LD when items exist, hide when empty |
| **Surface wiring** | Home page-builder `faq` type; PDP auto-embed; configurator SEO-shell embed |
| **Settings FAQ admin** | Redesigned Global \| Page FAQs tabs, surface picker, bilingual editor, APIs |
| **Answer lede coverage** | Audit/fill `seo_answer` / hero / configurator ledes on commercial surfaces |
| **Domain glossary** | `CONTEXT.md` terms: Page FAQ, FAQ surface, TL;DR → Answer lede |

### Schema

- `faq_page_sets`: unique `surface_key`, optional title labels (JSONB locale map), `visible`, timestamps.
- `faq_page_items`: `set_id` FK, `slug`, `content` JSONB `{ locale: { question, answer } }`, `position`, `visible`, timestamps.
- No change to Global FAQ tables required for v1.
- No merge/link between Global FAQ items and Page FAQ items in v1 (independent copies if the same question appears in both).

### API contracts (conceptual)

- List/get Page FAQ set by `surface_key` (public read for rendering; admin write).
- Admin: create/update/delete items; reorder; toggle visibility; ensure set exists for a surface (including `product:{id}`).
- Auth and permission aligned with existing FAQ admin routes.

### Interactions

- Home: page builder adds `faq` section → renderer loads `home` set → accordion + JSON-LD.
- PDP: server/client page loads `product:{productId}` set → if visible items, render below fold + JSON-LD.
- Configurators: after SEO intro, load `mp-config` or `mbolster-config` set → same embed rules.
- Settings: switch tab → pick surface → edit items; Global tab retains category/item management.

## Testing Decisions

Good tests assert externally visible behavior only (outputs of pure helpers and seed invariants), not React internals or DB wiring details.

| Module | Automated tests? | What to assert |
|--------|------------------|----------------|
| Page FAQ store | **Yes** | `surface_key` accept/reject; seed has en-US + zh-CN for seeded surfaces; no duplicate slugs per set; markdown strip for schema text (reuse Global FAQ helper behavior) |
| Page FAQ section | No | Manual / acceptance |
| Surface wiring | No | Manual / acceptance |
| Settings FAQ admin | No | Manual / acceptance |
| Answer lede coverage | No | Manual audit checklist |
| Domain glossary | No | Review in PR |

Prior art: Global FAQ self-check (`lib/faq` defaults count, bilingual presence, `stripMarkdownForSchema`); SEO `answer-lede` and `buildFaqPageJsonLd` helpers.

## Out of Scope

- Public `/faq` marketing page visual redesign
- FAQ embeds on blogs, learn-more slide-ins, or Editorial hubs CMS migration
- Tagging/reusing Global FAQ rows inside Page FAQ sets
- New TL;DR / key-takeaways UI distinct from **Answer lede**
- Blog answer-lede retrofit (already covered by prior SEO/AEO work)
- zh-CN translation project beyond seeded Page FAQ + filling existing lede fields where copy already exists or is seeded
- Changing guide hub FAQ storage (`guides-content`) in this PRD

## Further Notes

- Complements PRD Technical SEO / AEO / GEO: that PRD established Answer lede, Global FAQ schema, guides, and configurator SEO shells; this PRD adds page-local FAQ embeds on commercial URLs and Settings UX for them.
- Prefer 3–8 Page FAQ items per surface (enough for AEO, not a dump of Global FAQ).
- See [`issues/README.md`](issues/README.md) for vertical slice breakdown and build order.
