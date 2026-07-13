# Slice 10 — Science of Sleep MeasureTile stack

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 21

## What to build

Keep the same MeasureTile / measurement carousel section. Change internal layout from image-left / text-right to **image on top, title + description below**. Do not replace the section with a different component type.

## Acceptance criteria

- [x] Each measurement card shows diagram above text on mobile (and consistently on desktop unless a documented exception).
- [x] Title and description remain fully readable without overlap.
- [x] Same four measurement cards / copy; carousel shell may remain.

## Proof (2026-07-13)

`MeasureTile` uses `flex flex-col` with responsive diagram (`max-w-[150px]`) above title/description. Size Matters still mounts four `MeasureTile`s.

```bash
npx tsx components/ui/measure-tile.check.ts
# → measure-tile.check.ts: ok
```
