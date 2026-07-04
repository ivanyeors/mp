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

- [x] Settings page can configure reminder channels and SLA working days (default 5).
- [x] Unassigned held Results generate Telegram and/or email reminders per settings.
- [x] After SLA, Result is `expired`, hold is released, customer is emailed to restart.
- [x] Expiry runs such that it does not rely on capturing after auth expiry.
- [x] `sla-reminders` has behavior tests for working-day deadline and expiry eligibility.

## Status

**Done** on `cursor/sla-reminders-expiry`.

- `lib/sla-reminders` — working-day deadlines, `planHeldTick` (expire vs remind), expire-before-auth buffer
- `GET/PUT /api/results/sla-settings` — Results settings (site_settings keys)
- `GET/POST /api/cron/results-sla` — daily tick at 02:00 UTC (Hobby free-tier max is once/day); release hold, expire, remind
- Default auth buffer **48h** so a once-daily run (±1h Hobby jitter) still expires before Stripe’s 7d auth dies
- Results settings UI: Review SLA panel
- Migration `0047_result_sla.sql` — `last_reminder_at`
- Tests: `lib/sla-reminders/__tests__/sla-reminders.test.ts`

## Blocked by

- Slice 05 (held Results and payment intents exist)
