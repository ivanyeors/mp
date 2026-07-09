# Slice 06 — Morning-of nudge when day-before silent

Type: AFK
Parent: PRD `whatsapp-appointment-confirm` (`.claude/PRD-whatsapp-appointment-confirm/whatsapp-appointment-confirm-prd.md`)
Triage: needs-triage
User stories covered: 8–9, 10–11

## What to build

Extend the daily cron to send a single morning-of message for today's appointments that received day-before reminder but never confirmed or rescheduled.

- **Cron addition:** for events starting today (SGT), where reminder status is still `reminded` (no confirm/reschedule/cancel), send morning-of template — date, time, venue (event `location` if set, else settings venue). **No buttons.**
- Status → `morning_sent`.
- Idempotent: one morning-of per `calendar_event_id`.
- If still silent after morning-of: no further automation; no auto-cancel.
- State machine tests: reminded + today eligible → morning_sent; confirmed/rescheduled/cancelled → skip.

Demoable outcome: day-before sent yesterday, no reply, cron on appointment day sends morning-of only; no second nudge next day.

## Acceptance criteria

- [ ] Today's appointments with status `reminded` receive morning-of template once.
- [ ] Morning-of message includes date, time, and venue (location fallback to settings).
- [ ] No buttons on morning-of template.
- [ ] Status updates to `morning_sent`; no further cron messages for that event.
- [ ] Already `confirmed`, `rescheduled`, `cancelled`, or `morning_sent` events are skipped.
- [ ] `appointment-reminder-state` tests cover morning-of eligibility and skip cases.

## Blocked by

- Slice 03 (cron route, reminder log, day-before `reminded` status)
