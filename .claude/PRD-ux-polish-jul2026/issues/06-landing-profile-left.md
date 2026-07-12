# Slice 06 — Landing header: Profile to the left

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 9–10
PR group: **C**

## What to build

On the expanded (non-compact) landing sticky header, move `ProfileMenu` from the right cluster to the **left** column. Keep logo centered; LanguageToggle + ModeToggle on the right.

Do **not** add Profile to the landing app dock (CONTEXT.md: Profile is header / Menu pill, not a second dock icon).

Primary path:

- `components/ui/home-header.tsx`
- `components/auth/profile-menu.tsx` (only if layout props needed)

## Acceptance criteria

- [ ] Signed-in: Profile icon/control on the left of the expanded header.
- [ ] Logo remains centered.
- [ ] Language + theme remain on the right.
- [ ] Signed-out: left column empty or balanced; no layout collapse/jump that breaks the 3-column grid.
- [ ] Compact scroll dock unchanged (Online / In-Person / WhatsApp).

## Proof

Visual QA on mobile + desktop marketing home. No automated test required.

## Blocked by

None.
