# Slice 07 — Weekly availability windows + sectioned gear sheet

Type: AFK
Parent: PRD `appointments-locations-availability`
Triage: needs-triage
User stories covered: ⑤

## What to build

Replace the single open/close range with per-weekday windows, mirroring Google
Calendar's appointment-schedule availability, and give the gear sheet a layout
that can hold it.

- **Model** (`lib/appointments/settings.ts`): `availability: Record<0..6, {start:"HH:MM", end:"HH:MM"}[]>`
  (SGT wall clock, end exclusive, sorted, non-overlapping). Stored as one JSON
  `site_settings` key. `openHour`/`closeHour`/`bookableDays` become **derived**
  (earliest start / latest start / days with ≥1 window) so existing readers and
  the reminder/WhatsApp copy keep working; a legacy store with no `availability`
  key derives windows from the old three keys.
- **Slot engine** (`lib/appointments/slots.ts`): `listDaySlots` / `offerSlots`
  carve slots inside each window of that weekday (a slot must start and end
  within one window). Pure; tests cover two windows a day, a day with none,
  window shorter than a slot.
- **API** (`PUT /api/settings/appointments`): accept `availability`; validate
  shape, order, overlap and at least one window on one day; keep accepting the
  old trio and translate.
- **Calendar**: `businessHours` becomes the array form (one entry per window);
  "Set as open hours" from a selection adds/replaces the window for that weekday;
  the day-chip toggle clears/restores a day's windows; summary tile shows
  "per-day" when windows differ.
- **Gear sheet**: sections as tabs on desktop / stacked accordions on a phone —
  Locations / Availability / Booking / WhatsApp / Calendar. Availability editor:
  one row per weekday with `+ window`, time inputs (15-min step), "copy to all
  open days". Mobile: whole-row tap targets ≥44px, sticky Save above the dock.

## Acceptance criteria

- [ ] Two windows on one day yield slots only inside those windows (test).
- [ ] Derived `openHour`/`closeHour`/`bookableDays` match the windows; legacy keys round-trip.
- [ ] Calendar draws one business-hours band per window; Open/Closed headers follow.
- [ ] Sheet editor saves; validation errors are shown inline.
- [ ] `settings-mobile.check.ts` asserts the sheet's phone layout tokens.

## Blocked by

- Slice 03 (the sheet section structure this extends).
