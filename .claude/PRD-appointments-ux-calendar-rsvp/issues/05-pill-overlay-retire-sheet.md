# Slice 05 — Pill overlay on entries + retire Sheet (kills the "dupe")

Type: AFK
Parent: PRD `appointments-ux-calendar-rsvp` (`.claude/PRD-appointments-ux-calendar-rsvp/appointments-ux-calendar-rsvp-prd.md`)
Triage: needs-triage
User stories covered: ④⑤ (pill overlay entry) + ⑥ (no stacked drawers)

## What to build

Route every "book" entry point through the pill overlay to the page, and delete the Sheet
machinery that caused the stacked-drawer dupe.

- **Pill overlay**: reuse `Dialog` to host the `Pills` component; on pick →
  `router.push('/[lang]/appointments?type=…')`.
- **Rewire all 7 entry points** to open the overlay instead of `openBookAppointmentSheet()`:
  header In-Person (`home-header.tsx`), hero (`hero-section.tsx`), product panel
  (`purchase-panel-section.tsx`), support (`support-contact-page.tsx`), and the
  basic / premium / mbolster learn-more slide-ins.
- **Delete**: `BookAppointmentHost` (from `app/layout.tsx`), the inline hero
  `BookAppointmentSheet`, `openBookAppointmentSheet()` (`lib/book-appointment.ts`), the
  `mpillow:open-book-appointment` DOM event, and the now-dead Sheet shell
  (`book-appointment-sheet.tsx`).

Demoable outcome: clicking In-Person / Book anywhere opens the pill overlay → the
`/appointments` page. Opening booking from a learn-more slide-in no longer stacks a second
drawer — the dupe is gone.

## Acceptance criteria

- [ ] All 7 entry points open the pill overlay and navigate to `/appointments?type=…`.
- [ ] No stacked drawers from any entry point (verified from each learn-more slide-in).
- [ ] `BookAppointmentHost`, inline `BookAppointmentSheet`, `openBookAppointmentSheet`, and the
      `mpillow:open-book-appointment` event are removed with no dead references (tsc + lint clean).
- [ ] Overlay reuses the same `Pills` component as the inline page fallback (visual parity).

## Blocked by

- Slice 04 (the page route + `Pills` component must exist to navigate to / reuse).
