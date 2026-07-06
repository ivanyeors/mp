# Slice 05 — Mbolster learn-more refactor

Type: AFK
Parent: PRD `product-slide-sections` (`.claude/PRD-product-slide-sections/product-slide-sections-prd.md`)
Triage: needs-triage
User stories covered: 3, 6, 10, 17, 21–23, 26–27, 31

## What to build

Refactor the Mbolster learn-more slide-in to the template system. Shell unchanged (sticky footer CTAs).

**New templates:** `purchase_panel` (complex — gallery, price, size/case selectors, CTAs), `outcome_grid`, `testimonial_card`, `full_bleed_media` (if not done).

**Reuse:** `split_hero`, `size_guide_split`, `packaging_block`, `feature_carousel`.

**Carousel consolidation:** Replace five repetitive title+image sections (modular, customise, fillings, discover, wash-care) with `feature_carousel`(story) + closing `split_hero`(discover) per approved recipe. **Every image and paragraph from those sections must appear** in the carousel or discover block — no content deletion.

**Config:** Mbolster recipe:
`purchase_panel` → `split_hero`(about) → `size_guide_split` → `packaging_block` → `outcome_grid` → `testimonial_card` → `feature_carousel`(story) → `split_hero`(discover)

**Content parity:** Gallery images, price display, size/case selectors, review quote, rating breakdown, size guide image, packaging list, all story images (`fillings.webp`, `wash-care.webp`, `Bolster_Fillings_gif.webp`, IG posts, etc.) preserved.

## Acceptance criteria

- [ ] Mbolster slide-in opens from landing product card and app dock.
- [ ] Purchase panel: gallery thumbs, price, selectors, and CTAs behave as today.
- [ ] All former story-section images appear in carousel or discover section.
- [ ] Size guide, packaging, review, and highlights content complete.
- [ ] Footer CTAs unchanged (`/mbolster-config`, book appointment).
- [ ] Scroll length reduced vs today without missing content (verify manually).
- [ ] No landing page modifications.

## Blocked by

- Slice 02 — Basic Mpillow learn-more refactor
