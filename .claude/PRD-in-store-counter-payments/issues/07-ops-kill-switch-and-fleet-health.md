# 07 — Ops: a kill switch, fleet health, and a name against every charge

**Type:** AFK
**Blocked by:** 05
**User stories:** 15, 16
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`

## Goal

Make counter payments operable by whoever is in the shop rather than by whoever can
deploy. Three things: an off switch, a way to see whether the hardware is well, and
a name against every transaction.

## Kill switch (story 15)

Add `counterPaymentsEnabled` to `SlaSettings` in `lib/sla-reminders/index.ts`,
stored as `results_counter_payments_enabled`.

Reuse that store rather than inventing one. It already owns the Results settings,
its API (`/api/results/sla-settings`), its cached read and its UI
(`components/settings/review-sla-section.tsx`), and the authorization-hold toggle
`results_auth_hold_enabled` landed there on 2026-09-12 (`ce1fc950`) for the same
reason. A second settings module for one boolean is the kind of thing that gets
read as precedent.

The pattern is five one-liners — type, default, key, parse, serialize — and is
already demonstrated by `authHoldEnabled`.

Default **on**: a kill switch that ships off is indistinguishable from an unbuilt
feature, and the shop will not know to look for it.

When off:

- `POST counter-charge` refuses with `unavailable: "switched_off"` before touching
  Stripe.
- The counter control renders *Counter payments are switched off* with a link to
  the setting for an admin who can change it.
- *Request payment* is unaffected. The switch removes one instrument, never the
  ability to sell.

Place it beside the hold toggle in the settings panel, with copy that says what
turning it off costs: *Off — staff can only send a payment link. Existing charges
already taken are unaffected.*

## Fleet health

Extend slice 02's reader list into something that answers *is this going to work
tomorrow morning*:

- Status dot with last-seen relative time, already in slice 02.
- Device type and reader software version, since a **BBPOS WisePad 3** in Singapore
  requires a minimum software version and a stale reader silently stops taking
  payments.
- A note that smart readers update automatically when online and may restart to do
  it, with a pointer to Stripe's reader update windows — the failure mode is a
  reader rebooting mid-fitting, and the fix is a setting in Stripe's Dashboard
  rather than code.
- Counter payments taken in the last 7 days per **Location**, which is the cheapest
  proxy for *this reader is in use* and makes a silently-dead reader visible.

No alerting. A reader that is offline overnight is normal, and a pager for it would
be ignored within a week. Slice 05's preflight is the alert that matters, and it
fires at the moment it can be acted on.

## Attribution (story 16)

Slice 03 writes `taken_by: adminId` into the PaymentIntent metadata. Make it
legible without a Stripe login:

- The **Result** timeline names the **Staff** member for every charge event.
- The **Order** detail shows *Paid at the counter by <name>* where an online order
  shows its payment reference.
- `recordAdminAction` for the charge, so it lands in the existing audit log
  (`app/[lang]/settings/audit-log/`) alongside every other privileged act.

A disputed in-person transaction is the case this exists for: Stripe's dispute
evidence wants to know who took the payment and where, and reconstructing that from
timestamps afterwards is guesswork.

## Acceptance criteria

- [ ] `counterPaymentsEnabled` round-trips through `parseSlaSettings` /
      `slaSettingsToStored` losslessly for both values.
- [ ] Default is on; an absent key reads as on.
- [ ] Off: `counter-charge` refuses before any Stripe call; the control explains
      itself and links the setting.
- [ ] Off: *Request payment* still works, and a charge already taken still settles.
- [ ] The toggle sits beside the authorization-hold toggle with cost-naming copy.
- [ ] Reader list shows device type, software version and 7-day charge count per
      **Location**.
- [ ] Every charge event names the **Staff** member in the **Result** timeline.
- [ ] The **Order** detail shows who took a counter payment.
- [ ] `recordAdminAction` fires for a counter charge and appears in the audit log.
- [ ] `viewer` can see none of it; the settings section requires `inventory`, the
      charge requires `results`.

## Notes

Extending `SlaSettings` means `SLA_SETTING_KEYS` grows, and both the GET and the
PUT in `app/api/results/sla-settings/route.ts` need the new field — the `PutSchema`
and the `next` object are separate edits and missing the second silently drops the
value on save. `authHoldEnabled` has the same shape; copy it exactly.
