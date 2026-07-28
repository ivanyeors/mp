# Slice 03 — "Save to calendar" `.ics` on confirmation screen

Type: AFK
Parent: PRD `appointments-ux-calendar-rsvp` (`.claude/PRD-appointments-ux-calendar-rsvp/appointments-ux-calendar-rsvp-prd.md`)
Triage: needs-triage
User stories covered: ② (guest calendar save)

## What to build

A single "Save to calendar" button that hands the customer a standard `.ics` — on phones
this triggers the OS "add to calendar" sheet, letting them pick their own calendar app.

- **Builder** (`lib/appointments/ics.ts`): pure `buildVEvent({ summary, startIso, endIso,
  location, description, uid })` → RFC 5545 `VCALENDAR`/`VEVENT` string. SGT → UTC for
  `DTSTART`/`DTEND`; include `UID`, `SUMMARY`, `LOCATION`, `DESCRIPTION`. No dependency.
- **Route** (`app/api/appointments/ics/route.ts`): `GET` reads booking params from the query,
  returns the string as `Content-Type: text/calendar` with
  `Content-Disposition: attachment; filename="appointment.ics"`.
- **UI**: a "Save to calendar" `<a href="/…/ics?…">` on the booking confirmation screen
  (inside `BookingFlow`). No per-provider (Google/Apple/Outlook) dropdown.

Demoable outcome: after booking, tap "Save to calendar" on an iPhone → native Add-to-Calendar
sheet; on Android → calendar-app chooser; on desktop → downloads a file that opens the default
calendar app.

## Acceptance criteria

- [ ] `buildVEvent` emits a valid single-event `VCALENDAR`/`VEVENT` (BEGIN/END pairs, DTSTART/DTEND, SUMMARY, LOCATION).
- [ ] Route responds `text/calendar`; opens the add-sheet on iOS Safari and the chooser on Android Chrome.
- [ ] Button present on the confirmation screen; no provider dropdown; no new dependency added.
- [ ] Unit test: VEVENT required fields present and SGT→UTC time conversion correct.

## Blocked by

None - can start immediately. (The button lives inside `BookingFlow`, which moves wholesale to
the page in slice 04 — it rides along with no rework.)
