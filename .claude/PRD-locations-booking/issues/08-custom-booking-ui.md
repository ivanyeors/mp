# 08 — Custom booking UI (location picker + slot grid)

## Parent

[PRD — Locations, Result Location, SLA relocation & custom booking](../locations-booking-prd.md)

## What to build

The customer-facing booking flow that replaces Google's iframe with a Mpillow-branded flow
built on the slice 07 APIs — the one thing Google's scheduling can't do (a **Location**
picker).

- Replace the Google Appointment-Scheduling iframe in the booking sheet with a BookingFlow:
  **Appointment** type (customisation / readjustment) → **Location** picker (from
  `/api/locations`) → **date** → **slot grid** (`/api/appointments/slots`) → guest form
  (name, phone, email) → submit (`/api/appointments/book`).
- Reuse the existing sheet shell and the site-wide "open book appointment" event; the
  book-appointment button/trigger is unchanged.
- On success, show confirmation; the created event carries the chosen location's address and
  a WhatsApp reminder is scheduled by the backend.

## Acceptance criteria

- [ ] Booking sheet shows the custom flow (no Google iframe) with a location picker
- [ ] Only free times for the chosen day appear; a chosen slot books successfully
- [ ] Guest name/phone/email are captured and sent to `/api/appointments/book`
- [ ] Confirmation reflects the picked location; the Google event shows the right address
- [ ] Existing appointment settings (hours/duration/bookable days/blocked ranges) govern slots

## Blocked by

- #07 (booking backend APIs)
