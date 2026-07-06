# Slice 01 — Template foundation + renderer + agent catalog

Type: AFK
Parent: PRD `product-slide-sections` (`.claude/PRD-product-slide-sections/product-slide-sections-prd.md`)
Triage: needs-triage
User stories covered: 11–15, 18–19, 35

## What to build

Land the composable product slide-in architecture that all four learn-more sheets will use.

- **Content schemas:** TypeScript interfaces per template type (`SplitHeroContent`, `FeatureCarouselContent`, etc.) and a `ProductSlideSectionType` union.
- **Section config types:** `{ type, contentKey?, flip?, image?, images?, videoId?, … }` with discriminated union per `type`.
- **`resolve-slide-content`:** Pure helper — given product messages slice + `contentKey`, return typed content matching the template schema.
- **`ProductSlideSectionRenderer`:** Maps `type` → template component; merges resolved content with config media props; handles unknown type safely in dev.
- **`product_slide_section` wrapper:** Standard inner padding/rhythm (`px-4 md:px-6`, `py-6 md:py-8`, optional `border-t`).
- **First template:** `split_hero` (product-sections area) — refactor from existing `LeftContentRightImgSection` usage; no product copy inside.
- **Agent playbook:** `.cursor/marketing-page/product-slide-sections.md` — template catalog, schemas, composition rules, approved recipes, content-preservation rule.
- **Tests:** Resolver and/or renderer dispatch for at least one known type.

No slide-in wired end-to-end in this slice — proof via unit tests + optional Storybook-style isolated render if useful.

## Acceptance criteria

- [ ] `ProductSlideSectionType` union and per-template content interfaces exported.
- [ ] `resolve-slide-content` returns correctly typed content for a sample `contentKey`.
- [ ] `ProductSlideSectionRenderer` renders `split_hero` from a minimal config array without i18n inside the template.
- [ ] `product_slide_section` wrapper applied by templates consistently.
- [ ] Agent playbook documents all v1 template IDs, recipes, and “do not touch landing pages” rule.
- [ ] At least one automated test for resolver or renderer dispatch.
- [ ] No changes to landing pages, slide-in shells, or existing slide-in user-visible content.

## Blocked by

None — can start immediately.
