# Slice 02 — Basic Mpillow learn-more refactor

Type: AFK
Parent: PRD `product-slide-sections` (`.claude/PRD-product-slide-sections/product-slide-sections-prd.md`)
Triage: needs-triage
User stories covered: 1, 6–8, 12–13, 15–16, 21–23, 26–28, 32–33

## What to build

Complete the Basic Mpillow learn-more slide-in using the template system. Shell (header, progress, sticky Customise + Book footer) stays unchanged.

**Templates to implement (if not in 01):** `firmness_compare`, `feature_carousel` (unified card), `size_guide_split`, `video_section`.

**Config:** `basic-mpillow` section array per approved recipe:
`split_hero` → `firmness_compare` → `feature_carousel` → `size_guide_split` → `video_section`

**Slide-in:** `BasicMpillowLearnMoreSheet` inner body becomes renderer + config; remove duplicated inline section JSX.

**Content parity:** All `m.slides.basicMpillow` copy, images (`/m-pillow-518001-final-WEB.webp`, feature carousel images, `/sizecomparison.webp`), and YouTube `r9XfezALQhA` preserved. Footer links to `/mp-basic` and book appointment unchanged.

## Acceptance criteria

- [ ] Basic slide-in opens from landing "Learn more" and app dock as before.
- [ ] All five sections render in approved order with no missing paragraphs, list items, or table rows.
- [ ] Feature carousel shows all four features with correct images.
- [ ] Firmness dual-scale (Basic vs Premium ranges) unchanged.
- [ ] Sticky footer CTAs work (Customise → `/mp-basic`, Book appointment).
- [ ] `zh-CN` locale renders without missing keys.
- [ ] No landing page files modified.
- [ ] Basic slide-in inner file reduced to shell + renderer (no monolithic section markup).

## Blocked by

- Slice 01 — Template foundation + renderer + agent catalog
