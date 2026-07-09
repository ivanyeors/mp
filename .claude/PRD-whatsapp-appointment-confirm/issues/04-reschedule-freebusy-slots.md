# Slice 04 — Reschedule: freeBusy → 3 slots → pick → Calendar patch

Type: AFK
Parent: PRD `whatsapp-appointment-confirm` (`.claude/PRD-whatsapp-appointment-confirm/whatsapp-appointment-confirm-prd.md`)
Triage: needs-triage
User stories covered: 5–6, 12, 34

## What to build

Complete the Reschedule happy path from day-before **Reschedule** tap through slot pick and calendar update.

- **`appointment-slots` (deep module):** `freeBusy` busy intervals + settings rules → up to 3 start times (60 min, Tue–Sun, 10:00–18:00 last start, Asia/Singapore, ~14-day lookahead). Unit tests: no overlap, last-start rule, max three.
- **Webhook Reschedule handler:** status → `offering_slots`; send interactive list of three slots (inside 24h window after Reschedule tap per WhatsApp policy).
- **Slot pick handler:** `events.patch` new start/end on primary calendar; status → `rescheduled`; WhatsApp "new time confirmed" message with updated date/time.
- Persist offered slot ids on reminder row for audit.
- State machine tests cover: reminded → offering_slots → rescheduled.

Demoable outcome: tap Reschedule on day-before message, pick a slot, calendar event moves, confirmation WA received.

## Acceptance criteria

- [ ] Reschedule tap transitions status to `offering_slots` and sends interactive list with exactly three slots when available.
- [ ] Offered slots respect duration, bookable days, hours, busy intervals, and ~14-day lookahead.
- [ ] Slot pick patches calendar event start/end; `starts_at` on reminder row updated.
- [ ] Status becomes `rescheduled`; confirmation WhatsApp sent with new date/time.
- [ ] `appointment-slots` unit tests cover overlap, last-start 18:00 rule, and three-slot cap.
- [ ] `appointment-reminder-state` tests cover reschedule happy path.
- [ ] Re-picking or duplicate webhook delivery is idempotent.

## Blocked by

- Slice 03 (reminder log, cron, day-before send, webhook foundation)
