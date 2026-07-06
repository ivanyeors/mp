# Slice 04 — Cervical Neck Support learn-more refactor

Type: AFK
Parent: PRD `product-slide-sections` (`.claude/PRD-product-slide-sections/product-slide-sections-prd.md`)
Triage: needs-triage
User stories covered: 4–5, 21–24, 29–30

## What to build

Refactor the Cervical Neck Support nested slide-in to the template system. Shell unchanged (**Back** footer only, not Customise).

**New templates:** `media_intro`, `feature_card_grid`, `text_callout_block`, `full_bleed_media` (if not added in Premium slice).

**Config:** Cervical recipe:
`media_intro` → `split_hero`(why) → `full_bleed_media`(comparison) → `feature_card_grid`(benefits) → `text_callout_block`(difference)

**Triggers unchanged:** `openCervicalNeckSupportSheet` event, Premium accessory button, neck-pains learn-more CTA (landing component not modified — only cervical slide-in inner).

**Content parity:** All `m.slides.cervicalNeckSupport` fields rendered — hero eyebrow/title, why block + pouch image, round/flat head comparison, three benefits with images on cards 2–3, difference paragraphs, additional benefits callout. Preserve `bottomViewSource` i18n key (wire to footer or keep in locale files).

## Acceptance criteria

- [ ] Cervical sheet opens from Premium accessory CTA and neck-pains learn-more button.
- [ ] All five sections render; no copy or images dropped.
- [ ] Benefit cards show images for alignment and sleep-quality benefits as today.
- [ ] Comparison image (`round-flat-head-comp`) renders at wide aspect.
- [ ] Footer shows Back and closes sheet; no Customise CTA added.
- [ ] `openCervicalNeckSupportSheet` API unchanged.
- [ ] No landing page section markup changes.

## Blocked by

- Slice 02 — Basic Mpillow learn-more refactor
