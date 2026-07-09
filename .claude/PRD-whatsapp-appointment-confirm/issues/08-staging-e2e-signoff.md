# Slice 08 — Staging E2E signoff checklist (cron + Confirm/Reschedule/Cancel)

Type: HITL
Parent: PRD `whatsapp-appointment-confirm` (`.claude/PRD-whatsapp-appointment-confirm/whatsapp-appointment-confirm-prd.md`)
Triage: needs-triage
User stories covered: 40

## What to build

Run and document full staging verification of the appointment reminder system end to end. No new product code unless signoff exposes blocking bugs (file follow-up issues instead).

**Checklist (execute on staging):**

1. Meta app → templates approved → coexistence on `+65 8780 5311`.
2. Google OAuth env on Vercel → Calendar list works.
3. Webhook URL live → Meta verify succeeds.
4. Seed `/settings/appointments` (venue, hours, URLs, match strings).
5. Book test **Customisation** slot for tomorrow via Google Appointment Scheduling (phone on allowlist if non-prod).
6. Book test **Re-adjustment** slot for tomorrow (second test guest).
7. Trigger cron with `CRON_SECRET` (or wait for 09:00 SGT).
8. Receive day-before WA on test phone; guest name visible in Business app.
9. Tap **Confirm** on first booking → status `confirmed`; calendar unchanged.
10. On second booking tap **Reschedule** → pick slot → calendar patched; confirmation WA.
11. Book third slot; Reschedule → **reject** slots → event cancelled; cancel WA with **correct** rebook link per type.
12. Book fourth slot; do not reply to day-before; on appointment day receive morning-of only; no further messages.
13. Verify Google Contacts entries for test guests.
14. Verify `appointment_reminders` rows reflect final statuses.

Document results (pass/fail per step) in issue comment or short runbook addendum.

## Acceptance criteria

- [ ] All checklist steps executed on staging with pass/fail recorded.
- [ ] Confirm path verified without calendar mutation.
- [ ] Reschedule path verified with calendar patch and confirmation message.
- [ ] Cancel-after-reject path verified with type-matched rebook link (both Customisation and Re-adjustment).
- [ ] Morning-of sent only when day-before unanswered; no spam after morning-of.
- [ ] Google Contacts upsert visible in Business app name display.
- [ ] Any blocking defects filed as separate issues; this slice closed when checklist green or exceptions documented.

## Blocked by

- Slice 04 (reschedule path)
- Slice 05 (cancel path)
- Slice 06 (morning-of)
- Slice 07 (contacts upsert)
