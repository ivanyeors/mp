# Slice 08 — SLA reminders, settings, and auto-expiry

Type: AFK
Parent: PRD `template-linked-customisation` (`.claude/PRD-template-linked-customisation/template-linked-customisation-prd.md`)
User stories covered: 21, 22, 23, 31, 32

## What to build

Configurable ops reminders and automatic expiry for unassigned held Results.

- Settings: enable Telegram and/or email reminders, reminder intervals, SLA of **5 working days** (configurable default).
- `sla-reminders` module: compute working-day deadlines; schedule or cron tick sends reminders for `held` Results still unassigned.
- On SLA breach (and always before card authorization expiry): set Result `expired`, cancel PaymentIntent, email customer to restart customisation.
- Telegram reminders link to platform Result (notify only).

## Acceptance criteria

- [ ] Settings page can configure reminder channels and SLA working days (default 5).
- [ ] Unassigned held Results generate Telegram and/or email reminders per settings.
- [ ] After SLA, Result is `expired`, hold is released, customer is emailed to restart.
- [ ] Expiry runs such that it does not rely on capturing after auth expiry.
- [ ] `sla-reminders` has behavior tests for working-day deadline and expiry eligibility.

## Blocked by

- Slice 05 (held Results and payment intents exist)
