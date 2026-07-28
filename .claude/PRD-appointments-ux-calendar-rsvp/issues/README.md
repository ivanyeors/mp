# PRD — Appointments UX: calendar RSVP, guest calendar save, booking page redesign

Parent PRD: [`../appointments-ux-calendar-rsvp-prd.md`](../appointments-ux-calendar-rsvp-prd.md)

Vertical-slice issues (tracer bullets). AFK unless marked HITL.

| # | Slice | Type | Blocked by | Stories |
|---|-------|------|-----------|---------|
| 01 | Email required + Google invite (`sendUpdates:"all"`) | AFK | — | ③ + enabler |
| 02 | Appointment RSVP status in admin calendar | AFK | 01 | ① |
| 03 | "Save to calendar" `.ics` on confirmation screen | AFK | — | ② |
| 04 | Booking page route `/[lang]/appointments` + inline pills | AFK | — | ④⑤ |
| 05 | Pill overlay on entries + retire Sheet (kills dupe) | AFK | 04 | ④⑤⑥ |
| 06 | Redesign visual + real-device sign-off | HITL | 02, 03, 04, 05 | ①②⑤ |

Tracker: local only (no GitHub issues created for this PRD).

Notes:
- 01 gates 02: only real invites (`sendUpdates:"all"`) produce non-`needsAction` statuses to display.
- 03 is order-independent: the "Save to calendar" button lives inside `BookingFlow`, which
  moves wholesale to the page in 04 — button rides along, no rework.
- 04 leaves entry points on the old Sheet; 05 rewires all 7 and deletes the Sheet.
