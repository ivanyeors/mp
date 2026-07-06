# Slice 03 — Premium Mpillow learn-more refactor

Type: AFK
Parent: PRD `product-slide-sections` (`.claude/PRD-product-slide-sections/product-slide-sections-prd.md`)
Triage: needs-triage
User stories covered: 2, 6–9, 17, 21–25, 31–33

## What to build

Refactor the Premium Mpillow learn-more slide-in to the template system. Shell unchanged (Customise + Book bespoke footer).

**New templates:** `split_hero_dual_media`, `trust_strip`, `icon_list`, `spec_table`, `packaging_block`, `commitment_cards`, `help_contact` (reuse `split_hero`, `feature_carousel`, `firmness_compare`, `video_section` from Basic where applicable).

**Complex component:** `measurement_grid` — four measurement steps with images (shoulder, neck depth, head depth, neck length).

**i18n:** Add `trust_strip` items under `premiumMpillow` in `en-US` and `zh-CN` (washable, 10-year warranty, in-store customisation, 60-day readjustment — derived from existing premium messaging).

**Config:** Premium recipe per PRD (14 sections including two `video_section` entries).

**Content parity:** All existing premium copy, pricing table rows, feature carousel images, accessory block + cervical CTA (`openCervicalNeckSupportSheet`), both YouTube embeds, commitment/warranty text, help contact line preserved.

## Acceptance criteria

- [ ] Premium slide-in opens from landing and app dock.
- [ ] Trust strip visible after hero with four items in both locales.
- [ ] Full recipe order matches PRD; no section content omitted.
- [ ] Pricing table shows all size rows and pricing notes.
- [ ] Measurement grid shows all four steps with correct images.
- [ ] Accessory "Find out more" still opens Cervical Neck Support sheet.
- [ ] Footer CTAs unchanged (`/mp-config`, book bespoke).
- [ ] No landing page modifications.

## Blocked by

- Slice 02 — Basic Mpillow learn-more refactor
