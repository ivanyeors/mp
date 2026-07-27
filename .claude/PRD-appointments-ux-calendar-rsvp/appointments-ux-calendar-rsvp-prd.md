# PRD — Appointments UX: calendar RSVP, guest calendar save, booking page redesign

Source: grill-with-docs session 2026-07-27 (sg@mpillow.com). Follow-on to
`locations-booking` + `whatsapp-appointment-confirm`. Glossary term **Appointment
RSVP status** added to `CONTEXT.md`; ADR `0013` amended (Sheet→page + calendar
changes). Tracker: **local only** (no GitHub issues), same as `locations-booking`.

## Problem / user stories

1. **RSVP visibility (①)** — Staff can't tell from the Admin Panel calendar whether a
   customer confirmed. Google `responseStatus` is dropped on read (`calendar.ts:53`
   reads only `displayName/email/self`).
2. **Guest calendar save (②)** — Customers on non-Google calendars have no easy way to
   add the appointment to their own phone calendar.
3. **Email required (③)** — Email is optional today (`z.string().email().optional()`,
   label says "(optional)"); without it the customer isn't an attendee and can't be
   invited or RSVP.
4. **Booking UX (④⑤)** — The type step is a buried toggle inside a slide-in Sheet;
   wanted: a Customise/Readjust **pill** choice up front on a real page.
5. **Stacked-drawer "dupe" (⑥)** — Booking drawer opens on top of learn-more slide-ins
   (+ the flow mounts twice: global `BookAppointmentHost` + inline hero
   `BookAppointmentSheet`) → user closes two drawers.

## Decisions (from grill)

- RSVP = the **customer's** `responseStatus`, even when Staff books on their behalf
  (the invite still lands on the customer's email).
- `sendUpdates:"all"` on insert/reschedule/cancel; **email required** (client + server).
- Save-to-calendar = hand-built `.ics` (`text/calendar`) served from a route; single
  button on the confirmation screen; no per-provider dropdown; **no new dependency**.
- Booking → page route `/[lang]/appointments?type=…`; pill overlay before navigate;
  inline pill fallback on direct load; retire Sheet + host + dual mount + DOM event.
- Cal display: type fill + type label; RSVP pill + left-border accent —
  `accepted`→Confirmed green, `declined`→Declined red, `tentative`→Tentative amber,
  `needsAction`→Invited gray; legend split Type / Status; echo in click-detail dialog.

## Non-goals

- Per-Location calendars/availability (ADR 0013 unchanged — one shared availability).
- No local events table (Google Calendar stays the source of truth).
- Tier (basic/premium) is **not** chosen at booking — in-person slots are flexible.

## Links

- `CONTEXT.md` → **Appointment RSVP status** (Language); Flagged ambiguities (3 entries).
- `docs/adr/0013-custom-multi-location-booking.md` → Amendment (2026-07-27).
