# PRD — Locations, Result Location, SLA relocation & custom multi-location booking

## Problem Statement

Operators can't record **where** a **Result** originated. The Results table shows an
auto-derived **Source** (channel provenance: In-store / Online / Purchase) but there's no
way to say a submission came from a specific studio or clinical **partner**. Related pain:

- The **Result SLA reminder** config ("Review SLA") is pinned to the **top** of the
  Results page, pushing the actual table down every visit.
- Bulk ops are missing — operators tag, message, delete, and export **Results** one row at
  a time.
- Partners already power `/our-partners`, but there's no place to capture a partner's
  **address / postal**, and partners can't be selected as a **Result**'s origin.
- Appointments are **single-venue**. As Mpillow adds studios and works with clinical
  **partners** (**Local Ambassadors**), customers have no way to choose *which location*
  they're booking their **Customisation appointment** at, and the resulting Google
  Calendar event never carries the right venue address. Google's own Appointment
  Scheduling can't present a location chooser.

## Solution

Introduce a first-class **Location** and thread it through Results and booking, reusing the
existing partner CMS and appointment/Google-Calendar machinery rather than rebuilding it.

- **Unified `locations`** — one list with `type: own | partner`. `own` = Mpillow studios;
  `partner` = external clinics (**Local Ambassador**) that continue to render on
  `/our-partners` when `visible`. Partners gain **address / postal**. The existing partner
  table is migrated into this list, so the marquee and cards keep working unchanged.
- **Result Location** — a new editable **Location** column on the Results table (a
  dropdown of all locations), leaving the auto **Source** badge intact. Operators can set
  it per row.
- **Multi-select** — a checkbox column beside **Updated** driving a bulk bar: set
  **Location**, send **Group Updates**, delete, and export CSV.
- **Review SLA relocation** — the **Result SLA reminder** config moves to
  `/settings/general` as a collapsible section, giving the Results table its top back.
- **Custom booking page** — a Mpillow-branded booking flow that behaves like Google's
  (date → time-slot grid → guest details) with a **Location picker** in front. Availability
  stays a single shared schedule from existing appointment settings + the central Google
  Calendar. On submit, the app writes the event to Google Calendar via the API and **stamps
  the picked Location's address onto the event's location field**; a reminder row is written
  so WhatsApp **Appointment reminders** keep firing.

## User Stories

1. As an operator, I want a **Location** column on the Results table, so that I can see
   where each **Result** originated.
2. As an operator, I want the Location column to be an editable dropdown, so that I can
   assign or correct a **Result**'s origin without leaving the table.
3. As an operator, I want the auto **Source** badge (In-store / Online / Purchase) to stay
   as it is, so that channel provenance isn't lost when I set a Location.
4. As an operator, I want the Location dropdown to list both our own studios and partners,
   so that in-store, pop-up, and partner-clinic origins are all selectable.
5. As an operator, I want a checkbox beside the **Updated** column on each row, so that I
   can select multiple **Results** at once.
6. As an operator, I want a header checkbox, so that I can select every row on the page in
   one click.
7. As an operator, I want to bulk-set the **Location** on selected **Results**, so that I
   can tag a batch of walk-ins to one studio quickly.
8. As an operator, I want to bulk-send **Group Updates** on selected **Results**, so that I
   can push Telegram updates without clicking row by row.
9. As an operator, I want to bulk-delete selected **Results** behind a confirm, so that I
   can clear test or junk rows efficiently.
10. As an operator, I want to export selected **Results** as CSV, so that I can work with
    them offline for ops and reporting.
11. As an operator, I want the **Review SLA** (Result SLA reminder) config off the top of
    the Results page, so that the table is the first thing I see.
12. As an operator, I want the **Review SLA** settings on `/settings/general` in a
    collapsible section, so that config lives with other settings and stays out of the way.
13. As an operator, I want to keep editing SLA working days, reminder interval, auth-expiry
    buffer, channels, and ops email, so that no SLA capability is lost in the move.
14. As an admin, I want a **Locations** settings page, so that I can manage our studios and
    partners in one place.
15. As an admin, I want to add a location with a **type** of own or partner, so that I can
    distinguish Mpillow venues from external partners.
16. As an admin, I want to record a location's **address** and **postal code**, so that it
    can appear on booking events and partner listings.
17. As an admin, I want to upload a partner's logo, so that it shows on `/our-partners`
    (reusing the existing media picker).
18. As an admin, I want to toggle a location's visibility, so that only chosen partners
    appear publicly and own studios stay internal.
19. As an admin, I want to reorder partners, so that `/our-partners` ordering stays under
    my control.
20. As a visitor, I want `/our-partners` to keep showing only visible partners in the
    marquee and cards, so that the public page is unchanged by the internal locations work.
21. As a customer, I want to choose a **Location** when I book a **Customisation
    appointment**, so that I go to the studio or partner clinic that suits me.
22. As a customer, I want the booking flow to feel like Google's (pick a day, pick a time),
    so that it's familiar and simple.
23. As a customer, I want to only see times that are actually free, so that I don't book a
    slot that's taken.
24. As a customer, I want to enter my name, phone, and email when booking, so that Mpillow
    can confirm and remind me.
25. As a customer, I want my confirmed booking to appear on Mpillow's calendar with the
    correct venue address, so that I know where to go.
26. As an operator, I want a booked appointment to carry the chosen **Location**'s address
    in the Google Calendar event, so that staff and the customer see the right venue.
27. As an operator, I want booked appointments to still trigger WhatsApp **Appointment
    reminders**, so that the day-before/morning-of nudges keep working.
28. As an admin, I want to keep configuring booking hours, duration, bookable days, and
    blocked ranges, so that the custom booking respects the same rules as before.
29. As an operator, I want double-booking guarded at submit time, so that two customers
    don't grab the same slot.
30. As a developer, I want partners to be a `type='partner'` projection over locations, so
    that `/our-partners` can never leak an `own` studio.
31. As a developer, I want slot generation and the event payload to be pure, testable
    functions, so that time-boundary and address-stamping logic is locked down by tests.

## Implementation Decisions

**Schema / migrations** (additive; no rename — ADR 0012, prod-safe, no staging DB)
- Extend the existing `partners` table: `ADD COLUMN type` (`own | partner`, default
  `partner`), `address`, `postal_code`. Existing rows default to `type='partner'`.
  `partners_page` (the `/our-partners` CMS singleton) is untouched. The physical table
  keeps its legacy name; **Location** is the domain/UI term (`lib/locations`).
- Add `location_id` (nullable, FK → `partners(id)`) to `mp_config_responses` (the
  **Result** store), mirroring the discovery-source migration pattern.

**Modules**
- `lib/locations` — unified query/CRUD (`getLocations`, `getLocation`), plus a
  `ResolvedLocation` type. Consumed by the Results dropdown, the booking picker, and the
  Locations settings page.
- `lib/partners` stays the **partner projection** — its reads add a `type='partner'`
  filter over the `partners` table; the marquee/cards/`partners-page` consumers are unchanged.
- `listDaySlots(busy, settings, day)` (in the appointments slots module) — a pure function
  returning **all** free starts for one SGT day, factored out of the existing `offerSlots`
  (which caps at the WhatsApp offer count). Honors hours, duration, bookable days, and
  blocked ranges.
- `buildEventInsertBody(...)` — pure builder for the Google `events.insert` payload
  including start/end (SGT), summary (**Appointment** type), guest, and the **Location
  address** stamped into the event's `location` field. `createEvent` is a thin fetch
  wrapper that posts this body via the existing service-account auth (mirrors the existing
  `patchEventTimes`).
- `rowsToCsv(rows)` — pure CSV serialization for the Results bulk export.

**API contracts**
- `GET /api/appointments/slots?date=YYYY-MM-DD` → free slots for the day (freeBusy +
  `listDaySlots`).
- `POST /api/appointments/book` → validate the slot is still free, `createEvent` with the
  selected location's address, then write a pending **Appointment reminder** row; returns
  the calendar event id.
- `GET /api/locations` (public) → active locations for the booking picker.
- Results `location_id` is set through the existing responses upsert endpoint; no new
  write path is invented for single or bulk Location edits.

**UI**
- Results table gains a leading checkbox column and a Location `<Select>` (both
  `stopPropagation` so row-click navigation still works). A bulk action bar appears when
  ≥1 row is selected. Bulk send/delete reuse the existing per-row Telegram-send and
  delete logic in a loop; export is client-side.
- The **Review SLA** panel and its state move verbatim from the Results page to a
  `Collapsible` on `/settings/general`; the SLA settings API is unchanged.
- The Locations settings page is the repurposed partners admin page: existing fields plus
  type/address/postal; the "Work With Us" (partners_page) tab stays.
- The booking sheet's Google iframe is replaced by the custom BookingFlow (type →
  location → date → slot grid → guest form); the sheet shell and the site-wide open event
  are reused.

**Docs**
- CONTEXT.md gains a **Location** term and cross-links **Source** / **Discovery source** /
  **Entry source** to it; **Appointment** is amended for the location picker + address
  stamp + single shared availability; **Local Ambassador (clinical)** is noted as a
  `type='partner'` Location.
- Two ADRs: unified locations (partner as a subtype), and custom multi-location booking on
  the Google Calendar API with single shared availability.

## Testing Decisions

Good tests here assert **external behavior** of pure functions, not implementation
details — feed inputs, assert outputs — following the existing `lib/appointments` and
`lib/rma` unit-test style (no framework beyond the current runner, no fixtures).

Modules to test (all confirmed):
- **`listDaySlots`** — given busy intervals + settings, the returned free starts respect
  open/close hours, duration, bookable days, blocked ranges, and exclude past/overlapping
  slots. Prior art: existing appointment slot tests around `offerSlots`.
- **`buildEventInsertBody`** — the payload carries the correct SGT start/end, summary, and
  the **Location address** in the event `location` field (the address-on-event contract).
- **`rowsToCsv`** — headers, field order, and escaping of commas/quotes/newlines.
- **locations projection** — `getPartners()` returns only `type='partner'` visible rows
  (so `/our-partners` can't leak an `own` studio) and `getLocations()` returns both types.

## Out of Scope

- **Per-location availability / hours.** v1 uses one shared schedule; picking a location
  only stamps the event address. Per-location hours or separate calendars are deferred.
- **Per-partner Google Calendar onboarding.** Bookings write to the single central
  calendar; partners don't need their own Google calendars.
- **Online payment / deposit at booking.** Booking collects contact details only.
- **Booking rescheduling/cancellation UI.** The existing WhatsApp reschedule flow is
  unchanged; no new self-serve reschedule surface.
- **Reworking the auto Source channel logic.** Source stays exactly as derived today.
- **Multi-calendar or resource/staff assignment** per booking.

## Further Notes

- Reuse over rebuild: partners, the media picker, the appointment settings, Google
  service-account auth, `freeBusy`, slot carving, and the WhatsApp reminder pipeline all
  already exist. The only net-new backend function is `events.insert` (`createEvent`).
- Double-booking is guarded by a freeBusy re-check just before insert; a stricter per-slot
  lock is a known upgrade path if races appear (single shared calendar makes this low risk).
- Renaming a live table is safe: only six files read `.from("partners")`; all are updated
  to `locations` with a type filter where partner-specific.
- Branch hygiene: this is separate from the in-flight `feat/returns-rma` work (which has
  unapplied migrations) — build on a fresh branch off `main`. New migrations are not
  auto-applied; apply locally and stage explicitly.
