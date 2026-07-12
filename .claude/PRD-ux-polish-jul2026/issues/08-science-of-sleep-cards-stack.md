# Slice 08 — Science of Sleep measurement cards stack

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 12–13
PR group: **D**

## What to build

In the Science of Sleep slide-in, section **“How do we adjust Mpillow accurately for you?”**, fix measurement card layout so content stacks properly on mobile (no overlap, clipped text, or page-level horizontal scroll from wide tiles).

Prefer a simple mobile stack (or single-column carousel card width = 100%) over clever multi-card rows. `MeasureTile` 150×150 icons are a likely overflow source — shrink or wrap on narrow widths.

Primary paths:

- `components/slide-in-pages/size-matters-slide-in.tsx`
- `components/ui/apple-cards-carousel.tsx`
- `components/effects/SpotlightCard.tsx` (only if required)

## Acceptance criteria

- [ ] Mobile: each measurement card’s title + body fully readable without overlapping neighbors.
- [ ] Opening the slide-in does not introduce horizontal scroll on the page or sheet body.
- [ ] Desktop/tablet carousel behavior remains acceptable.
- [ ] Copy strings unchanged (layout only).

## Proof

Mobile screenshot of the measurement section in the open sheet.

## Blocked by

None.
