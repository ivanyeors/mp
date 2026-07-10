# Slice 06 — PDPs: auto Page FAQ embed for `product:{id}`

Type: AFK
Parent: PRD `page-faq-embeds` (`.claude/PRD-page-faq-embeds/page-faq-embeds-prd.md`)
Triage: needs-triage
User stories covered: 13–14, 18

## What to build

Auto-embed Page FAQs on **Storefront product** PDPs:

- Resolve `surface_key=product:{productId}`.
- If ≥1 visible item, render public Page FAQ section below fold (after description tabs or equivalent established PDP layout).
- If empty, render nothing (no product flag required).
- Emit `FAQPage` JSON-LD on that PDP URL when showing FAQs.
- Seeded main products from slice 02 should show FAQs out of the box; other products remain empty until ops add items in Settings.

Demoable outcome: open a seeded product PDP → FAQ accordion + JSON-LD; open a product with no set → no FAQ block.

## Acceptance criteria

- [x] PDP with visible Page FAQs shows accordion below fold.
- [x] PDP without visible items shows no FAQ section.
- [x] FAQPage JSON-LD on PDP when FAQs show; omitted when hidden.
- [x] Locale matches page locale.
- [x] No regression to existing Product JSON-LD / answer lede.

Proof: `npx tsx --env-file=.env.local app/[lang]/shop/[slug]/pdp-page-faq.check.ts` → `pdp-page-faq self-check ok`

## Blocked by

- Slice 03 (public Page FAQ section)
- Slice 04 (Settings to manage product surfaces)
