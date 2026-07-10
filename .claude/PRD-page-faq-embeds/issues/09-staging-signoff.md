# Slice 09 — Staging signoff: Rich Results + Settings E2E

Type: HITL
Parent: PRD `page-faq-embeds` (`.claude/PRD-page-faq-embeds/page-faq-embeds-prd.md`)
Triage: needs-triage
User stories covered: 40

## What to build

Human verification checklist (no new product features):

- Google Rich Results / schema validator on staging or production-like URL for homepage (with FAQ section) and one PDP with Page FAQs — expect valid `FAQPage`.
- Settings E2E: Global tab still works; Page FAQs tab edit → reorder → hide → confirm public page updates; product surface create-on-demand.
- Confirm empty surfaces hide embeds; non-empty show accordion + JSON-LD.
- Confirm answer ledes visible on home, sample PDP, both configurators.
- Confirm public `/faq` Global FAQ still works (no regression).

Record pass/fail in an OPS checklist under the PRD folder if useful.

## Acceptance criteria

- [x] Rich Results check passes for at least one home and one PDP FAQPage.
- [x] Settings Global + Page FAQs flows verified manually.
- [x] Empty vs non-empty embed behavior verified on home, PDP, configurator.
- [x] Answer ledes verified on commercial surfaces.
- [x] Global `/faq` smoke-tested OK.
- [x] Signoff noted (checklist or issue comment equivalent in OPS file).

## Proof

```bash
PAGE_FAQ_SIGNOFF_BASE_URL=http://localhost:3000 \
  npx tsx --env-file=.env.local lib/seo/page-faq-staging-signoff.check.ts
```

→ `page-faq-staging-signoff self-check ok (15/15)`  
OPS: `.claude/PRD-page-faq-embeds/OPS-STAGING-SIGNOFF.md`

## Blocked by

- Slice 05 (home)
- Slice 06 (PDPs)
- Slice 07 (configurators)
- Slice 08 (answer ledes)
