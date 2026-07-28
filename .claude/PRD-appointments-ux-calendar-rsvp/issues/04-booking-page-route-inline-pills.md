# Slice 04 — Booking page route `/[lang]/appointments` + inline pills

Type: AFK
Parent: PRD `appointments-ux-calendar-rsvp` (`.claude/PRD-appointments-ux-calendar-rsvp/appointments-ux-calendar-rsvp-prd.md`)
Triage: needs-triage
User stories covered: ④⑤ (booking becomes a page with a pill-first type choice)

## What to build

Move the booking flow out of the slide-in Sheet onto a real page route, fronted by a
Customise/Readjust pill choice. This slice stands alone (reachable by direct URL); entry
points still use the old Sheet until slice 05.

- **Page** `app/[lang]/appointments/page.tsx`: renders `BookingFlow` reading
  `?type=customisation|readjustment`. When `type` is absent/invalid → render an inline
  `Pills` chooser (Customise / Readjust) that sets the type.
- **Pills component**: extract a reusable pill/type-picker (large rounded pills styled after
  the hero tier pills / Image #3). Used inline here; reused as the overlay in slice 05.
- **`BookingFlow` refactor**: take `type` from prop/query instead of the internal toggle
  default; remove the in-form Customisation/Readjustment toggle. The existing Sheet keeps
  working by passing `type` through until slice 05 retires it.

Demoable outcome: visit `/en-US/appointments` directly → pick a pill → the form
(location → date → slot → guest) appears → book via the existing `/api/appointments/book`.

## Acceptance criteria

- [ ] `/[lang]/appointments?type=…` renders the form with the type applied.
- [ ] No/invalid `type` → inline Customise/Readjust pills; picking one reveals the form.
- [ ] Booking submits via the existing `/api/appointments/book`; `appointment_type` carried through.
- [ ] The in-Sheet type toggle is removed from `BookingFlow`; the Sheet still functions (type passed in).
- [ ] `Pills` component is reusable and standalone (inline now, overlay in slice 05).

## Blocked by

None - can start immediately.
