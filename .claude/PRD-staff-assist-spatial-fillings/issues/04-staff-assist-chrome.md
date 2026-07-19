# Slice 04 — Staff assist mode chrome: gating, layout, size×tier, template load

Type: AFK
Parent: PRD `staff-assist-spatial-fillings` (`.claude/PRD-staff-assist-spatial-fillings/staff-assist-spatial-fillings-prd.md`)
Triage: needs-triage
User stories covered: 1, 2, 3, 4, 5, 6, 7, 11, 42

## What to build

**Staff assist mode** appears on the customisation preview (`/mp-config`, `/mp-basic`; bolster in Slice 13) only when the session is **Staff** (existing `admin_users`/bootstrap check). Guests see today's flow byte-for-byte.

- Left column gains: size×**tier** control and a filling panel (v1 = simple per-cell list editor; x-ray replaces it in Slices 07/08) with a **Filling Template** picker (active, size-scoped) that loads a mix into session state
- Size×tier change: confirm dialog → clear placements → load new size's **Default Filling Template**; re-check cover/case/add-on eligibility (not offered for size → auto-clear; stock 0 → keep + existing out-of-stock/**Pre-order** signals)
- Right column untouched (cover, case, add-ons, contact, discovery, shipping, hold CTA)
- No template create/save-as-template control anywhere in assist

## Acceptance criteria

- [ ] Guest session renders zero assist chrome on all three configurator routes
- [ ] Staff session shows the left assist panel on `/mp-config` and `/mp-basic`; session mix survives step navigation within the preview
- [ ] Size change without confirm leaves placements untouched; with confirm loads the new default template
- [ ] Wrong-size cover/case/add-on is cleared with a visible note; zero-stock keeps selection with OOS/Pre-order signal
- [ ] `*.check.ts` self-check for gating + size-change rules (prior art: `pre-order-trigger.check.ts`)

## Blocked by

- Slice 01 — spatial placements core
