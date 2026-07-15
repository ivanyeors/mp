# Slice 07 — Automated Pre-order restock email

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 12–13, 15

## What to build

When inventory recovers enough that the Pre-order trigger would clear for matching items/lengths, automatically email open Pre-order **Results** in status **`held`** or **`assigned`**. Idempotent (one notice per Result). Skip expired/declined/captured/canceled. Email copy: restocked; Sign in in a few days to track customisation (**Result**) status. No Staff-triggered send in v1. Live preview for new sessions already flips via slice 05.

## Acceptance criteria

- [x] Restock event selects only Pre-order Results in `held`/`assigned`.
- [x] Email sends once; second event does not re-send (idempotent marker).
- [x] Expired/declined/captured/canceled excluded.
- [x] Automated tests for selection + idempotency.
- [x] New configurator sessions show Proceed when stock recovered (slice 05 live trigger).

## Blocked by

- Slice 06 (need persisted Pre-order mode on Results).
