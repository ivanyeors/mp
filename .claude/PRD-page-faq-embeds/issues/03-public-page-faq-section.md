# Slice 03 — Public Page FAQ section + FAQPage JSON-LD (hide when empty)

Type: AFK
Parent: PRD `page-faq-embeds` (`.claude/PRD-page-faq-embeds/page-faq-embeds-prd.md`)
Triage: needs-triage
User stories covered: 12, 14, 17–21

## What to build

Reusable public embed that reads the Page FAQ store and renders a compact accordion in landing-section rhythm (`max-w-6xl`, H2, muted body), with:

- Optional “View all FAQs” link to Global FAQ (`/faq`).
- `FAQPage` JSON-LD when ≥1 visible item (reuse existing FAQ JSON-LD builder + markdown strip).
- Hide entirely when the surface has no visible items.
- Answers present in the DOM for crawlers (not client-only after open).
- Locale-aware question/answer from the store.

Wire a minimal preview path if needed for manual check (e.g. temporary use on a page or Story-less manual render via an existing surface once seed exists) — full surface wiring is slices 05–07.

Demoable outcome: given a seeded surface, the section renders accordion + valid FAQPage JSON-LD; empty surface renders nothing.

## Acceptance criteria

- [x] Compact accordion matches landing section spacing/typography conventions.
- [x] Empty visible list → component returns null / no section chrome.
- [x] Non-empty → `FAQPage` JSON-LD in page output with Question/Answer pairs.
- [x] Answer text is in HTML without requiring accordion open.
- [x] Link to `/faq` present when section shows.
- [x] Locale selects correct bilingual content.

Proof: `npx tsx --env-file=.env.local components/page-faq/page-faq-section.check.ts` → `page-faq-section self-check ok`

## Blocked by

- Slice 02 (Page FAQ store)
