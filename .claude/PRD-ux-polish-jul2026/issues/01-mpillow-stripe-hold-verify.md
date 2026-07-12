# Slice 01 — Mpillow Stripe hold verification

Type: HITL (+ AFK fix if broken)
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 1–2
PR group: **A**

## What to build

Verify the Mpillow Authorization hold path end-to-end on staging:

- Preview → POST `/api/results/hold` → Stripe Checkout session
- Successful session creation (test mode)
- Cancel / back → `?hold_cancelled=1` restores preview via `hold-cancel-restore`
- No silent 4xx/5xx on hold create for a valid preference + shipping + email payload

Fix only what fails. Do not redesign Checkout UI.

Primary paths:

- `app/api/results/hold/route.ts`
- `lib/authorization-hold/`
- `lib/configurator/hold-cancel-restore.ts`
- `app/[lang]/mp-config/mp-config-client.tsx`

## Acceptance criteria

- [ ] Staging: valid Mpillow preview can create a hold Checkout URL without error.
- [ ] Staging: cancel Checkout returns to configurator preview with cover/case/shipping/email restored when persistence applies.
- [ ] Existing automated restore check still passes if restore code is touched.
- [ ] Failures are filed as concrete bugs in this slice (not left as “check later”).

## Proof

```bash
npx tsx lib/configurator/hold-cancel-restore.check.ts
# → hold-cancel-restore.check.ts: ok

# HITL staging checklist (attach notes in PR):
# 1. Complete mp-config to preview, authorize with Stripe test card flow start
# 2. Cancel Checkout → land on preview with selections
# 3. Re-authorize succeeds
```

## Blocked by

None — can start immediately.
