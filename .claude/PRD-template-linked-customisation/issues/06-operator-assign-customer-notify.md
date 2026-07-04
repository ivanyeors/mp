# Slice 06 — Operator assign + customer notify (platform only)

Type: AFK
Parent: PRD `template-linked-customisation` (`.claude/PRD-template-linked-customisation/template-linked-customisation-prd.md`)
User stories covered: 11, 12, 24, 25, 26, 29, 30, 41

## What to build

Operators assign size×tier (or length) and Filling Template on the platform; customers are notified of the final build.

- Results list/detail: for `held` and in-store review-only Results, **confirm or override** suggested size×tier (pillow) or length (bolster), required Filling Template picker **filtered by product type and size** (only templates for the selected size appear).
- Operator UI labels use **tier**, not kind.
- On save: validate stock via `build-assembly` / inventory checks; transition to `assigned` via `result-lifecycle`; recompute final amount via `result-pricing` when a hold exists.
- Email customer with summary + link to status page (online/held Results). In-store review-only may notify staff-facing only if no customer email payment path — still persist assignment on the Result.
- Status page shows final build: size, **tier** or length, filling summary, preferences (cover/case), add-ons, price breakdown (when priced). Accept/Decline controls disabled until slice 07 if capture API not ready, or read-only assigned state.
- Telegram is not used for assignment (no reply parsing).

## Acceptance criteria

- [ ] Operator can confirm the suggested size×tier / length **or override** it to a different valid size×tier / length.
- [ ] Operator cannot save assignment without a Filling Template.
- [ ] Filling Template picker lists only active templates for the Result’s product type and the **selected** size (filter updates when size is overridden).
- [ ] Assignment updates Result to `assigned` with composed sellable + filling template ids and final amount (when hold exists).
- [ ] Stock validation failure blocks assignment with a clear error.
- [ ] Customer receives email with link to status page showing size, tier/length, filling summary, preferences, add-ons, and price breakdown.
- [ ] Status page (and account area if logged in) shows the same final build summary.
- [ ] Operator-facing UI uses **tier**, not kind.
- [ ] No Telegram reply handling is introduced; assignment is only via platform UI/API.

## Blocked by

- Slice 05 (held Results exist)
- Slice 02 (Filling Template pick-list)
