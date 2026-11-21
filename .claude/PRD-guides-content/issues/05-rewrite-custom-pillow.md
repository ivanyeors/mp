# Slice 05 — Rewrite /guides/custom-pillow

Type: AFK, then HITL claim read
Parent: PRD `guides-content`
Triage: needs-triage

## What to build

- Write `data/guides/custom-pillow.md` to section 3 of `../page-blueprints.md`, following `.claude/PRD-search-visibility/content-standard.md` and the PRD's copy rules.
- If D1 = merge, fold in the strongest sections of the blog page it absorbs, in new words where the blog copy is weaker.
- Use existing images now. Leave out a figure that is waiting on slice 07 rather than using a placeholder.
- Open every cited source before citing it; anything unsourced is cut or marked `[[cite: …]]` (which fails the check).
- Facts about Mpillow come only from the site's own copy, with no prices (Costings is the source of sell price). Anything marked **Wanted** is asked of the owner or left out.

## Acceptance criteria

- [ ] `pnpm checks guides` passes.
- [ ] 1,800–2,800 words; every H2 opens with a direct answer.
- [ ] At least one fact only Mpillow can state, nothing invented.
- [ ] Owner reads the claims (D2) and signs off in this file.
- [ ] Preview screenshots, desktop and phone, sent to the owner.

## Blocked by

Slice 02
