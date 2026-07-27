# Slice 02 — Appointment RSVP status in admin calendar

Type: AFK
Parent: PRD `appointments-ux-calendar-rsvp` (`.claude/PRD-appointments-ux-calendar-rsvp/appointments-ux-calendar-rsvp-prd.md`)
Triage: needs-triage
User stories covered: ① (RSVP visibility)

## What to build

Surface the customer's Google RSVP on each appointment in the Admin Panel calendar, as a
second visual channel that does not disturb the existing type colors.

- **Read** (`lib/appointments/calendar.ts`): add `responseStatus?` to the attendee type
  (line ~53); in `mapGCalItemToRangeEvent`, derive the guest RSVP = `responseStatus` of the
  first **non-`self`** attendee (missing → `needsAction`); add `rsvp` to `CalendarRangeEvent`.
- **API** (`app/api/settings/appointments/events/route.ts`): pass `rsvp` through.
- **View** (`components/settings/appointments-calendar.tsx` + `.css`): render a status
  **pill** + **left-border accent** by rsvp — `accepted`→**Confirmed** green,
  `declined`→**Declined** red, `tentative`→**Tentative** amber, `needsAction`→**Invited** gray.
  Keep the type fill color and **add a type label** ("Customise"/"Readjust") on the event.
  Split the legend into Type / Status groups. Add a Status row to the click-detail dialog.

Demoable outcome: a booking the customer declined shows a red "Declined" pill; accepted →
green "Confirmed"; no reply yet → gray "Invited". Busy/blocked events are unaffected (no pill).

## Acceptance criteria

- [ ] `responseStatus` read from event attendees; non-`self` guest chosen; missing → `needsAction`.
- [ ] Pill + accent render for all four statuses with the agreed labels/colors.
- [ ] Type fill preserved; type label shown; Google busy / OOO / blocked ranges get no RSVP pill.
- [ ] Legend shows Type + Status groups; click-detail dialog shows a Status row.
- [ ] Pure mapper unit test: attendee `responseStatus` → `CalendarRangeEvent.rsvp` (incl. missing → `needsAction`, and `self` attendee ignored).

## Blocked by

- Slice 01 (only real invites via `sendUpdates:"all"` produce non-`needsAction` statuses to show).
