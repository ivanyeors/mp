# 07 — Booking backend: slots + createEvent

## Parent

[PRD — Locations, Result Location, SLA relocation & custom booking](../locations-booking-prd.md)

## What to build

The server side of custom multi-location booking, reusing the existing appointment
settings, Google service-account auth, `freeBusy`, and WhatsApp reminder pipeline. The only
net-new Google call is `events.insert`.

- `listDaySlots(busy, settings, day)` — pure function returning **all** free starts for one
  SGT day, factored out of the existing `offerSlots` (which caps at the WhatsApp offer
  count). Honors open/close hours, duration, bookable days, blocked ranges; excludes
  past/overlapping slots.
- `buildEventInsertBody(...)` — pure builder for the Google `events.insert` payload:
  start/end in SGT, summary (**Appointment** type), guest details, and the selected
  **Location**'s address stamped into the event `location` field.
- `createEvent(...)` — thin fetch wrapper posting that body via the existing service-account
  auth (mirrors `patchEventTimes`).
- `GET /api/appointments/slots?date=YYYY-MM-DD` → `freeBusy` + `listDaySlots`.
- `POST /api/appointments/book` → re-check `freeBusy` for the slot, `createEvent` with the
  location address, then write a pending **Appointment reminder** row; returns the event id.
- `GET /api/locations` (public) → active locations for the picker.
- Unit tests: `listDaySlots` (boundary rules) and `buildEventInsertBody` (address-on-event
  contract + SGT times).

## Acceptance criteria

- [ ] `GET /api/appointments/slots` returns free slots respecting settings + freeBusy
- [ ] `POST /api/appointments/book` creates a Google Calendar event with the location address
      in the event `location` field
- [ ] Booking writes an `appointment_reminders` row so WhatsApp reminders fire
- [ ] A slot already busy is rejected at submit (freeBusy re-check)
- [ ] `GET /api/locations` returns active locations
- [ ] `listDaySlots` and `buildEventInsertBody` unit tests pass

## Blocked by

- #01 (ADR 0013 booking decision), #02 (locations for `/api/locations` + address)
