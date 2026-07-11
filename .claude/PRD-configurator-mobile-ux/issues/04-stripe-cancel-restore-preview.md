# Slice 04 — Stripe cancel → preview restore

Type: AFK
Parent: PRD `configurator-mobile-ux` (`.claude/PRD-configurator-mobile-ux/configurator-mobile-ux-prd.md`)
Triage: done
User stories covered: 32–37, 43, 45

## What to build

When a visitor cancels Stripe Checkout for an **Authorization hold**, return them to the **preview / customisation** screen (Customer preference + hold prep), not welcome.

- Persist enough Mpillow client state (step + cover/case/add-ons/shipping/email as needed) so `cancelUrl` → `/mp-config?hold_cancelled=1` (and basic path) restores preview.
- Harden Mbolster restore (already persists step) so cancel reliably lands on preview with selections intact.
- Optional light “payment cancelled” notice on restore.
- Desktop and mobile both get restore behavior (flow fix, not chrome).
- Automated tests for restore logic (given stored state / query flag → preview step + preserved selections).

Do not change Stripe Checkout UI or hold pricing; server cancel path already targets configurator URLs.

## Acceptance criteria

- [x] Cancelling hold Checkout on Mpillow returns to preview/customisation, not welcome restart.
- [x] Cancelling hold Checkout on Mbolster returns to preview/customisation.
- [x] Cover/case (and other preserved hold-prep selections) survive cancel when previously chosen.
- [x] `hold_cancelled` (or equivalent) can show a light cancelled notice without clearing the form.
- [x] Intentional Exit/Close still clears session as today.
- [x] Automated test covers restore helper / state mapping.
- [x] mp-basic hold cancel follows the same restore destination pattern.

## Proof

```bash
npx tsx lib/configurator/hold-cancel-restore.check.ts
# → hold-cancel-restore.check.ts: ok
```

Helper: `lib/configurator/hold-cancel-restore.ts`  
Wired: `mp-config-client.tsx` (full + basic surfaces), `mbolster-config-client.tsx`  
Server cancel URL already: `?hold_cancelled=1` on configurator paths.

## Blocked by

None — can start immediately (parallel with 01 and 02).
