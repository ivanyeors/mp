# Booking is first-party with a Location picker, writing to Google Calendar via events.insert

**Appointments** are booked through Mpillow's **own** booking flow — appointment
**type** → **Location** picker → date → slot grid → guest form — instead of the
embedded Google Appointment-Scheduling **iframe**. On submit the server calls the
Google Calendar API `events.insert` into the central calendar and **stamps the
picked Location's address into the event `location` field**. Everything else in
`lib/appointments/*` (service-account auth, `freeBusy`, WhatsApp reminders,
reschedule) is reused unchanged.

Availability is **one shared calendar**, not per-Location schedules: the existing
appointment settings (open/close hours, duration, bookable days, blocked ranges)
plus central-calendar `freeBusy` drive a single slot grid. The Location choice
only affects the **address stamped on the event**, not which times are free.

## Why

Google's scheduling iframe cannot offer a **Mpillow-controlled Location picker**
that writes a specific address onto the event — that is the one capability the
business needs and the only reason to leave Google's UI. The calendar itself, the
service-account auth, reminders, and reschedule already work and stay the source
of truth, so the net-new backend surface is deliberately tiny: a single
`events.insert` wrapper (`createEvent`) mirroring the existing `patchEventTimes`,
plus a pure `listDaySlots` factored out of the existing `offerSlots` (which caps
at the WhatsApp offer count).

## Booking submit path

`POST /api/appointments/book` re-checks `freeBusy` for the chosen slot, calls
`createEvent` with the Location address, then writes a pending **Appointment
reminder** row via the existing `upsertPendingReminder` so WhatsApp reminders
fire exactly as today.

> ponytail: last-writer-wins on the pre-insert `freeBusy` re-check — no per-slot
> lock. Add a guard only if real double-books appear.

## Considered options

- **Keep Google's iframe** — rejected: no Location picker, cannot stamp a chosen
  address, no branding control. This is the gap that motivated the work.
- **One Google Appointment schedule per Location** — rejected: multiplies
  Google-side config, splits availability, and still can't drive our own UI; the
  business runs one shared availability, not per-site calendars.
- **A full custom availability engine** (per-Location hours, resources, buffers) —
  rejected as YAGNI: one shared availability from existing settings covers v1;
  revisit only if Locations need independent calendars.
- **First-party flow + `events.insert` with shared availability (chosen)** —
  smallest change that delivers the Location picker while reusing the entire
  existing calendar/reminder pipeline.

## Consequences

- The Google iframe (`BOOK_APPOINTMENT_URL`) is retired for this flow; the
  book-appointment trigger/sheet shell and open-event are reused.
- `/settings/appointments` (hours/duration/bookable days/blocked ranges) now
  governs **our** slot grid, not just the reminder cron.
- Because availability is shared, two Locations can't be booked into the same time
  slot — acceptable for a single-team studio in v1; per-Location calendars are a
  future ADR if needed.
- `listDaySlots` and `buildEventInsertBody` are pure and unit-tested (slot
  boundary rules; address-on-event contract + SGT times); the `createEvent` fetch
  wrapper stays thin.

## Amendment (2026-07-27): Sheet → page route, pill-first type picker, guest calendar

The slide-in **Sheet** shell is retired for booking. Booking now lives at a real
page route **`/[lang]/appointments`** (reads `?type=customisation|readjustment`).
Entry points open a **pill overlay** (Customise / Readjust, styled after the hero
tier pills) → `router.push('/[lang]/appointments?type=…')`; a direct load with no
`type` renders the same pills inline (deep-link/refresh safe). One `Pills`
component serves overlay + inline.

This removes the **stacked-drawer "dupe"**: the booking flow mounted twice — the
global `BookAppointmentHost` (root layout) **and** an inline hero
`BookAppointmentSheet` — and its "Book" buttons on the learn-more slide-ins opened
the booking drawer **on top of** an already-open drawer, so users had to close
two. All 7 entry points (header In-Person, hero, product panel, support, +
basic/premium/mbolster learn-more) now **navigate** instead of calling
`openBookAppointmentSheet()`. Removed: `BookAppointmentHost`, the inline
`BookAppointmentSheet`, `openBookAppointmentSheet()`, the
`mpillow:open-book-appointment` DOM event.

Backend is unchanged (`events.insert` + Location-address stamp + one shared
availability). Two calendar-side changes ride along:

- **`sendUpdates: "all"`** on `events.insert` / reschedule / cancel — the customer
  now receives the Google invite (an `.ics` any calendar app can add). Trade-off
  accepted: customers get Google-branded emails on every booking change (they
  already get WhatsApp reminders).
- **Email is required** (client + server zod; drop `.optional()`) so the guest is
  always an attendee — the precondition for reading their **Appointment RSVP
  status** (`responseStatus`) and showing it in the Admin Panel calendar as a
  status pill + type label. A **Save to calendar** button on the confirmation
  screen serves a hand-built `.ics` for immediacy (native add-sheet on phones).

> ponytail: `.ics` is a ~15-line VEVENT string builder + one `text/calendar`
> route — no add-to-calendar dependency. RSVP rides the existing live GCal read
> (add `responseStatus` to the attendee type); no new table.
