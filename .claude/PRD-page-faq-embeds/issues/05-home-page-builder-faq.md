# Slice 05 — Home: page-builder `faq` section → `home` surface

Type: AFK
Parent: PRD `page-faq-embeds` (`.claude/PRD-page-faq-embeds/page-faq-embeds-prd.md`)
Triage: needs-triage
User stories covered: 11, 30–32

## What to build

Wire the homepage to Page FAQs via the landing page builder:

- Add `faq` section type to landing section types and admin picker.
- Renderer loads `surface_key=home` via Page FAQ store and renders the public Page FAQ section.
- Section JSON does not duplicate Q&A content (placement/visibility of the section only; copy lives in Settings).
- If home set is empty, public page shows no FAQ chrome (section may exist but renders empty/null).

Demoable outcome: add FAQ section in page builder, seed/edit home Page FAQs in Settings, homepage shows accordion + FAQPage JSON-LD.

## Acceptance criteria

- [x] Page builder can add/reorder/show/hide a `faq` section.
- [x] Homepage renders home Page FAQs when section visible and set non-empty.
- [x] Q&A copy is not edited inside page-builder section content.
- [x] Empty home set → no public FAQ block.
- [x] FAQPage JSON-LD present on home when FAQs show.

Proof: `npx tsx --env-file=.env.local components/sections/landing/home-page-faq.check.ts` → `home-page-faq self-check ok`

## Blocked by

- Slice 03 (public Page FAQ section)
- Slice 04 (Settings Page FAQs so ops can edit `home`)
