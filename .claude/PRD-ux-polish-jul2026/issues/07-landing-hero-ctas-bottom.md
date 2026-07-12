# Slice 07 — Landing hero: CTAs bottom-aligned (mobile)

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 11
PR group: **C**

## What to build

On mobile, move the hero CTA group (Customise + Book appointment) down so it aligns to the bottom of the hero visual plane and reveals more product in the image. Keep dock clearance so CTAs are not hidden under the app dock.

Avoid mid-hero CTA stacks that wall off the product. Desktop can keep current vertical centering if it already works.

Primary paths:

- `components/sections/landing/hero-section.tsx`
- Clearance tokens in `app/globals.css` only if needed for this section

## Acceptance criteria

- [ ] Mobile: CTAs sit at the bottom of the hero overlay (above dock clearance).
- [ ] More of the hero product image is visible above the CTA band vs current mid-stack.
- [ ] Headline + short supporting copy still readable (may tighten spacing; do not dump secondary marketing into the hero).
- [ ] Desktop layout not regressively broken.

## Proof

Before/after mobile screenshot on PR.

## Blocked by

None. Soft coordination with slice 09 if clearance tokens change.
