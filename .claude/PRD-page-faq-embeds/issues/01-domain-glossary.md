# Slice 01 — Domain glossary: Page FAQ, FAQ surface, TL;DR → Answer lede

Type: AFK
Parent: PRD `page-faq-embeds` (`.claude/PRD-page-faq-embeds/page-faq-embeds-prd.md`)
Triage: done
User stories covered: 1–3

## What to build

Update `CONTEXT.md` so agents and operators share vocabulary for this PRD:

- **Page FAQ** — Q&A list owned by one **FAQ surface**, rendered on that URL with `FAQPage` JSON-LD; independent of Global FAQ (`/faq`).
- **FAQ surface** — `home` | `mp-config` | `mbolster-config` | `product:{productId}`.
- Note under **Answer lede**: industry “TL;DR” maps to Answer lede; do not introduce a separate TL;DR block.
- Clarify **Global FAQ** vs **Page FAQ** relationship (no shared rows in v1).

Demoable outcome: glossary terms present; no product code required.

## Acceptance criteria

- [x] `CONTEXT.md` defines **Page FAQ** and **FAQ surface** with Avoid notes where useful.
- [x] **Answer lede** entry notes TL;DR as an alias / industry synonym, not a new UI.
- [x] Global FAQ vs Page FAQ boundary is explicit (independent catalogs).
- [x] Example dialogue or flagged ambiguities updated if needed for clarity.

## Blocked by

None - can start immediately
