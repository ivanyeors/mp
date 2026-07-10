# OPS — Staging signoff (Slice 09)

Parent: `.claude/PRD-page-faq-embeds/issues/09-staging-signoff.md`  
User story: 40  
**Signed off:** 2026-07-10 (local production-like + store proofs)

## How to re-run

```bash
# Store + render proofs (no server required)
npx tsx --env-file=.env.local lib/seo/page-faq-staging-signoff.check.ts

# + live HTML against local (or staging) host
PAGE_FAQ_SIGNOFF_BASE_URL=http://localhost:3000 \
  npx tsx --env-file=.env.local lib/seo/page-faq-staging-signoff.check.ts
```

Expected: `page-faq-staging-signoff self-check ok (15/15)`

Post-deploy Google Rich Results Test (public URL):

- Home: https://search.google.com/test/rich-results?url=https%3A%2F%2Fcustom.mpillow.com%2Fen-US
- PDP: https://search.google.com/test/rich-results?url=https%3A%2F%2Fcustom.mpillow.com%2Fen-US%2Fshop%2Fmpillow-basic
- Global FAQ (already live): https://search.google.com/test/rich-results?url=https%3A%2F%2Fcustom.mpillow.com%2Fen-US%2Ffaq

## Checklist

| AC | Status | Evidence |
|----|--------|----------|
| Rich Results / schema validator: home + PDP `FAQPage` | **Pass** | `rich_results_home` / `rich_results_pdp` — Google FAQPage shape; live HTML script tags on localhost home + PDP |
| Settings Global + Page FAQs (edit → reorder → hide → public) | **Pass** | `settings-faq.check.ts` CRUD roundtrip + Global\|Page FAQs tabs chrome |
| Empty vs non-empty embeds (home / PDP / config) | **Pass** | `empty_vs_nonempty` + home/pdp/config embed checks |
| Answer ledes on commercial surfaces | **Pass** | `answer-lede-coverage.check.ts` + live home lede in HTML |
| Global `/faq` smoke | **Pass** | `global_faq` + `live_global_faq`; prod `custom.mpillow.com/en-US/faq` still has FAQPage |
| Signoff recorded | **Pass** | This file + check stdout matrix 15/15 |

## Matrix (2026-07-10)

```text
PASS	settings_e2e	settings-faq self-check ok
PASS	page_faq_section	page-faq-section self-check ok
PASS	home_embed	home-page-faq self-check ok
PASS	pdp_embed	pdp-page-faq self-check ok
PASS	config_embed	configurator-page-faq self-check ok
PASS	answer_ledes	answer-lede-coverage self-check ok (PDP seo_answer already present)
PASS	rich_results_home	FAQPage eligible (4 Qs)
PASS	rich_results_pdp	FAQPage eligible (4 Qs)
PASS	empty_vs_nonempty	empty hides; home+configs show accordion+JSON-LD
PASS	ledes_content	home seoAnswer dense; PDP/config covered by answer_ledes check
PASS	global_faq	5 cats / 32 items FAQPage-shaped
PASS	live_home	FAQPage + answer lede in HTML
PASS	live_pdp	FAQPage + data-page-faq in HTML
PASS	live_configs	both configs FAQPage in HTML
PASS	live_global_faq	Global /faq FAQPage in HTML
page-faq-staging-signoff self-check ok (15/15)
```

## Fixes found during signoff

1. **Home had no `faq` landing section** — created visible `home-page-faq` section so home emits Page FAQ + FAQPage.
2. **PDP FAQPage JSON-LD was only in RSC flight** when slotted into the client tree — moved FAQPage `JsonLdScript` into `shop/[slug]/layout.tsx` (alongside Product JSON-LD) so crawlers get a real `<script type="application/ld+json">`.

## Notes

- Prod (`custom.mpillow.com`) as of signoff: Global `/faq` has `FAQPage`; home/PDP/config Page FAQ embeds **not deployed yet** — re-run Google Rich Results URLs after ship.
- No new product features beyond the two crawlability fixes above (HITL verification slice).
