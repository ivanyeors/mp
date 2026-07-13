# Slice 02 — Mbolster FAQ close below accordion

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 3

## What to build

Mbolster welcome (i) FAQ dialog: use `hideClose` and an inline close control **below** the FAQ accordion (document flow, scrolls with content). Match the Mpillow FAQ dismiss pattern. Do not leave a fixed/corner X.

## Acceptance criteria

- [x] Mobile: close appears below the FAQ accordion and scrolls with dialog content.
- [x] No fixed/corner X overlapping FAQ content.
- [x] Desktop: close remains reachable.
- [x] FAQ copy/items unchanged.

## Proof (2026-07-13)

Welcome FAQ uses `DialogContent hideClose` + inline `OverlayDismissButton` after `PageFaqAccordion`.

```bash
npx tsx "app/[lang]/mbolster-config/faq-dismiss.check.ts"
# → mbolster FAQ dismiss self-check ok: inline close follows accordion
```
