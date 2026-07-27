# Slice 01 — Email required + Google invite (`sendUpdates:"all"`)

Type: AFK
Parent: PRD `appointments-ux-calendar-rsvp` (`.claude/PRD-appointments-ux-calendar-rsvp/appointments-ux-calendar-rsvp-prd.md`)
Triage: needs-triage
User stories covered: ③ (email required) + enabler (customer invited)

## What to build

Make email mandatory and actually send the customer a Google Calendar invite — the
precondition for RSVP (slice 02) and the cross-provider `.ics` (slice 03).

- **Client** (`components/slide-in-pages/booking-flow.tsx`): email `<Input>` gets
  `required`; drop the "(optional)" label span; add a valid-email check to `canSubmit`;
  submit sends `email: email.trim()` (remove `|| undefined`).
- **Server** (`app/api/appointments/book/route.ts`): zod `email: z.string().email()`
  (drop `.optional()`).
- **Calendar writes** (`lib/appointments/calendar.ts`): `createEvent` (events.insert),
  `patchEventTimes` (reschedule), `deleteEvent` (cancel) send `sendUpdates=all`.

Demoable outcome: booking without an email is blocked (submit disabled + server 400);
booking with an email delivers a Google invite email (with `.ics`) to the customer, and
reschedule/cancel notify them too.

## Acceptance criteria

- [ ] Client submit is disabled until a valid email is entered; no "(optional)" text.
- [ ] Server rejects missing/invalid email with 400.
- [ ] `events.insert`, `events.patch`, and `events.delete` requests include `sendUpdates=all`.
- [ ] Attendee receives the Google invite email on book (and notification on reschedule/cancel).
- [ ] Existing booking/appointment tests updated for required email; `buildEventInsertBody` still attaches the attendee.

## Blocked by

None - can start immediately.
