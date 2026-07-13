# Slice 09 — Landing hero: mobile CTAs lower in hero

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 19–20

## What to build

On mobile only: keep Customise and Book appointment **inside the same hero image container**, but move them lower (bottom band above dock clearance) so more of the product is visible. Headline/lede stay higher. Desktop hero layout unchanged.

## Acceptance criteria

- [x] Mobile: CTAs sit lower in the hero image plane and no longer cover the product mid-frame.
- [x] CTAs remain inside the hero container (not a new section below the image).
- [x] Dock clearance respected so CTAs are not hidden under the dock.
- [x] Desktop layout unchanged.

## Proof (2026-07-13)

Mobile: column + `mt-auto` CTA band with `--mobile-bottom-clearance`; desktop `md:` resets. No double-counted outer hero padding (reconciled with slice 11).

```bash
npx tsx components/ui/landing-header-hero.check.ts
# → landing-header-hero.check.ts: ok
```
