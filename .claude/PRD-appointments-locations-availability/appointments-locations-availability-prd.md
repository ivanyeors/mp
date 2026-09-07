# PRD — Appointments: bookable Locations, Location legend, chip redesign, weekly availability

Source: design session 2026-09-06/07 (sg@mpillow.com). Follow-on to
`locations-booking` (ADR 0012/0013) and `appointments-ux-calendar-rsvp`.
Tracker: **local only** (no GitHub issues), same as its parents.

## Problem / user stories

1. **Bookable Locations (①)** — Staff cannot choose which **Locations** take
   appointments. Worse, the customer picker filtered on `visible`, which only
   governs `/our-partners`; own studios are saved `visible=false`, so they never
   reached the picker.
2. **Location on the calendar (②)** — The Admin Panel calendar only knew a
   Location as the free-text address stamped on the Google event. Staff cannot
   see at a glance where an appointment is.
3. **Chip overflow (③)** — Time + "Mpillow Customisation (Name)" + type chip +
   RSVP pill painted past the bottom of a 60–90 min event box.
4. **Cancelled (④)** — Google-cancelled appointments vanish at read; staff
   sometimes want to see them.
5. **Weekly availability (⑤)** — Availability is one open/close range for every
   bookable day. Google Calendar's appointment schedule allows per-weekday
   windows (several per day). Staff need the same, on the calendar and in a
   gear sheet laid out to hold it.

## Decisions

- `partners.bookable boolean not null default true` (additive, ADR 0012).
  Independent of `visible`. The public feed = bookable ∧ has address.
  `/api/appointments/book` 409s a switched-off Location. Toggle endpoint lives
  under `/api/settings/appointments/*` (the `results` grant), not the
  `page-builder` CMS routes. Last bookable Location cannot be switched off.
- Location identity on events: stamp `extendedProperties.private.mpLocationId`
  on insert; resolve id → exact address (whitespace/case-insensitive) → null.
- Location colour = the third channel (fill = type, left accent = RSVP, dot =
  Location). Six-colour palette by position; no stored colour in v1.
- Chip = one line: `● [type icon] Guest name … [status icon]`; venue line only
  where the slot is tall enough; nothing paints outside the slot. Type icons:
  sparkle (Customise) / refresh (Readjust). Status icons: tick / cross / ? /
  envelope / ban. Labels live in the legend + detail sheet.
- Cancelled is opt-in (`showCancelled`, off by default): `showDeleted=true` on
  the events list, only known appointments survive, drawn faded + struck.
- Weekly availability: `availability` = per-weekday list of `{start,end}`
  windows in SGT, replacing the single open/close pair as the source for the
  slot engine, the WhatsApp offers, the calendar business hours and the
  chip-free "Open" headers. `openHour`/`closeHour`/`bookableDays` are
  **derived** for callers that still need a coarse range. Gear sheet is
  sectioned (Locations / Availability / Booking / WhatsApp / Calendar) with a
  per-day window editor.

## Non-goals

- Per-Location availability or calendars (ADR 0013 unchanged).
- A stored per-Location colour, legend dots as filters, buffers/resources.

## Links

- `CONTEXT.md` → **Location** (bookable), **Appointment RSVP status** (icons).
- `docs/adr/0012-locations-unified-partner-model.md`, `0013-custom-multi-location-booking.md`.
