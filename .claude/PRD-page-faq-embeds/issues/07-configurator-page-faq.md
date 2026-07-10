# Slice 07 — Configurators: Page FAQ on `mp-config` / `mbolster-config` shells

Type: AFK
Parent: PRD `page-faq-embeds` (`.claude/PRD-page-faq-embeds/page-faq-embeds-prd.md`)
Triage: needs-triage
User stories covered: 15–16, 18

## What to build

Embed Page FAQs on configurator commercial URLs:

- `mp-config` → surface `mp-config`
- `mbolster-config` → surface `mbolster-config`
- Place after SEO intro / answer lede, before or around the client wizard in a crawlable region.
- Auto-show when ≥1 visible item; hide when empty.
- `FAQPage` JSON-LD on those URLs when showing.

Demoable outcome: view source / load `/en-US/mp-config` and `/en-US/mbolster-config` with seeded FAQs → accordion + JSON-LD; empty set → no block.

## Acceptance criteria

- [x] `mp-config` renders its Page FAQ set when non-empty.
- [x] `mbolster-config` renders its Page FAQ set when non-empty.
- [x] Empty set → no FAQ chrome.
- [x] FAQPage JSON-LD present when FAQs show.
- [x] Existing ConfiguratorSeoIntro (H1, answer lede, Product JSON-LD) unchanged in behavior.

Proof: `npx tsx --env-file=.env.local app/[lang]/mp-config/configurator-page-faq.check.ts` → `configurator-page-faq self-check ok`

## Blocked by

- Slice 03 (public Page FAQ section)
- Slice 04 (Settings to manage configurator surfaces)
