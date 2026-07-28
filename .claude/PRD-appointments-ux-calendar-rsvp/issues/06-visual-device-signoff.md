# Slice 06 — Redesign visual + real-device sign-off

Type: HITL
Parent: PRD `appointments-ux-calendar-rsvp` (`.claude/PRD-appointments-ux-calendar-rsvp/appointments-ux-calendar-rsvp-prd.md`)
Triage: needs-triage
User stories covered: ① (cal pills/labels) ② (`.ics`) ⑤ (pill overlay + page)

## What to review

Human design + real-device pass over the shipped surfaces before merge.

- Pill overlay + `/appointments` page match the Image #3 aesthetic (large rounded pills)
  in light/dark, mobile + desktop.
- Admin-calendar RSVP pills / type labels are legible in day/week/month views and both themes.
- `.ics` "Save to calendar" actually opens the add-sheet on a real **iPhone** and a real
  **Android**; the Google invite email is received by the customer.
- Update the OPS device sign-off matrix (as in prior PRDs).

Demoable outcome: signed-off screenshots + an updated device matrix; user (sg@mpillow.com)
approval to merge.

## Acceptance criteria

- [ ] Pill overlay + page approved on a real iPhone and a real Android.
- [ ] Cal RSVP pills/labels legible with the correct colors (Confirmed/Declined/Tentative/Invited) in both themes.
- [ ] `.ics` add-to-calendar verified on iPhone + Android; Google invite email received.
- [ ] Sign-off recorded (OPS matrix / PRD status note).

## Blocked by

- Slice 02 (RSVP display)
- Slice 03 (`.ics` save)
- Slice 04 (booking page + pills)
- Slice 05 (overlay + Sheet retirement)
