# Slice 09 — Filling usage analytics: unpromoted ranking + Promote

Type: AFK
Parent: PRD `staff-assist-spatial-fillings` (`.claude/PRD-staff-assist-spatial-fillings/staff-assist-spatial-fillings-prd.md`)
Triage: needs-triage
User stories covered: 28, 29, 30

## What to build

Every written **Filling configuration** snapshot is counted by fingerprint. Inside Configure → **Filling Config tab** (per product card and size — not a global list), a ranked **Unpromoted configuration** list shows usage counts for mixes that are not catalog templates. A **Promote** action names one and creates a catalog **Filling Template** from its placements, in place. No storefront promote; no separate Analytics surface.

## Acceptance criteria

- [ ] Two Results using the same diverged mix rank it with count 2 under the matching product card + size only
- [ ] Mixes exactly matching an existing template never appear as unpromoted
- [ ] Promote creates a named active template whose placements equal the fingerprinted mix; the entry leaves the unpromoted list
- [ ] Promote is Admin Panel only (no configurator entry point)
- [ ] Vitest for ranking scoping + promote round-trip

## Blocked by

- Slice 05 — hold snapshot (fingerprint writes)
- Slice 06 — assign spatial (fingerprint writes for guest path)
