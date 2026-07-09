# Slice 05 — Second reject → cancel Event + cancel WA + matching rebook link

Type: AFK
Parent: PRD `whatsapp-appointment-confirm` (`.claude/PRD-whatsapp-appointment-confirm/whatsapp-appointment-confirm-prd.md`)
Triage: needs-triage
User stories covered: 7, 13–14

## What to build

When a guest rejects offered reschedule slots (second reject), cancel the calendar event and send a final WhatsApp with the correct rebook link.

- **Webhook reject handler:** after `offering_slots`, if guest rejects all slots or sends equivalent reject action → `events.delete` or cancel on primary calendar.
- **Cancel message:** use cancel template outside 24h window; service text inside window when applicable. Body includes matching Google rebook URL from `appointment-type` (Customisation vs Re-adjustment; fallback Customisation).
- Status → `cancelled`.
- State machine tests cover: offering_slots → cancelled on second reject.

Demoable outcome: Reschedule → reject offered slots → calendar event gone, cancel WA with correct booking link for appointment type.

## Acceptance criteria

- [ ] Second reject deletes or cancels the calendar event on `admin@mpillow.com` primary.
- [ ] Reminder row status → `cancelled`.
- [ ] Cancel WhatsApp includes correct rebook URL for Customisation vs Re-adjustment (fallback to Customisation URL).
- [ ] Template vs service-text choice follows WhatsApp 24h window policy.
- [ ] `appointment-type` test: summary → correct rebook URL.
- [ ] `appointment-reminder-state` test: offering_slots + reject → cancelled.
- [ ] Idempotent: duplicate reject webhook does not double-delete or double-message.

## Blocked by

- Slice 04 (reschedule slot offer flow must exist)
