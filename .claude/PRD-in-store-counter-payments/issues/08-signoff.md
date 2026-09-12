# 08 — Sign-off: one real reader, one real card, one real Singapore dollar

**Type:** HITL
**Blocked by:** 06, 07
**User stories:** all
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:checkout`, `area:admin`

## Why this cannot be AFK

Everything above is built and tested against Stripe's **simulated reader**, which
is a faithful model of the API and no model at all of the physical situation. What
only a human can establish:

- A card reader on the shop's actual WiFi, behind the shop's actual firewall.
- A real card in a real hand, and the several seconds a person takes to find it.
- Whether `waiting_for_card` is legible on a phone held at arm's length while
  talking to somebody.
- Whether the reader's screen and the **Admin Panel** agree about the amount.
- That live SGD moved into the MELLOW LIFE account, and a real receipt arrived.

## Prerequisites

Order these on the day slice 01 starts; hardware lead time is the long pole and
nothing else is blocked by it.

- [ ] A smart reader on the MELLOW LIFE account. **Stripe Reader S710** is the
      recommendation — it has 4G LTE, so a shop-WiFi problem does not become a
      payments outage. **BBPOS WisePOS E** is the cheaper option and fine on a
      reliable network.
- [ ] Physical Stripe test cards, for live-mode rehearsal before a customer's card
      is involved.
- [ ] The MELLOW LIFE live webhook endpoint `we_1UEpVxCMlMx7bA76xFJYdCCj`
      subscribed to `payment_intent.succeeded`,
      `terminal.reader.action_succeeded` and `terminal.reader.action_failed` —
      12 events total, up from the 9 it carries today.
- [ ] `custom.mpillow.com` confirmed as the endpoint host. Stripe does not follow
      redirects for webhooks and `work.mpillow.com` 308s, which has already broken
      delivery once on this account.
- [ ] Counter payments toggled on (slice 07), and the **Terminal Location**
      registered for Chai Chee with the real address (slice 02).

## Test matrix

Record every row in `../OPS-SIGNOFF.md` with date, tester, reader, and outcome.

### Sandbox rehearsal, physical reader

| # | Case | Expect |
|---|---|---|
| 1 | Happy path, contactless tap | Approved, **Order** created, `delivered` |
| 2 | Happy path, chip insert + PIN | Approved |
| 3 | Declined test card | Mapped copy, no **Order**, **Result** still `assigned` |
| 4 | Retry after decline with a good card | One **Order**, and Stripe shows **one** PaymentIntent |
| 5 | Cancel while waiting for card | Nothing charged, reader returns to idle |
| 6 | PayNow scan (slice 06) | Approved through the same path |
| 7 | Reader unplugged before charging | `reader_offline`, *Send a link instead* offered |
| 8 | Reader unplugged mid-payment | No **Order**, no charge, recoverable |
| 9 | Page reloaded mid-payment | Resumes into the correct state |
| 10 | Double-press *Charge* | One PaymentIntent |
| 11 | Approved, then close the laptop before settling | **Result** reads `stuck` / `topup_unsettled`; *Complete the sale* settles it with no second charge |
| 12 | Re-assign the build mid-charge | Refuses, asks to restart, old amount not charged |
| 13 | Counter payments switched off | Control explains itself; *Request payment* still works |

### Live mode, real money

| # | Case | Expect |
|---|---|---|
| 14 | One real card, smallest sellable build | Live SGD in MELLOW LIFE; **Order** correct |
| 15 | Stripe receipt | Arrives, names MELLOW LIFE, amount matches |
| 16 | Refund it through RMA | Refunds against the charge; no Terminal involvement |
| 17 | Money ledger and margins | Match the **Order** total |
| 18 | Attribution | Timeline and **Order** detail name the **Staff** member |

### Handset, in the shop

| # | Case | Expect |
|---|---|---|
| 19 | Whole flow on a real phone at 375px | No horizontal scroll, 44px targets |
| 20 | `waiting_for_card` at arm's length | Readable without leaning in |
| 21 | Both locales (`en`, `zh`) | No overflow, no untranslated strings |
| 22 | An assistant who has not seen it before | Completes a sale unaided |

Row 22 is the acceptance test for slice 04's copy. If it needs narration, the
finding is a copy change, not a training note.

## Also not ours, but needs the same afternoon

Two items that want a live database and a real card and are easy to sweep in here
— listed so they are not tested by nobody, and marked so they are not signed off
as part of this initiative:

- **Slice 14 of `PRD-staff-assist-spatial-fillings`** — its catalog save path has
  never run against a real database. Belongs to that slice's sign-off.
- **The link-paid `topup_unsettled` sweep** — slice 05 widened the SLA cron to scan
  `assigned` rows with `topup_paid_at`, which fixes the monitoring gap for *both*
  instruments. Test the link-paid case as well as the counter case, because the
  link path has had live rows since PR #129 and has been unmonitored throughout.

## Acceptance criteria

- [ ] All 22 rows recorded in `../OPS-SIGNOFF.md` with outcomes.
- [ ] At least one live-mode counter payment settled and refunded end to end.
- [ ] Row 4 and row 10 verified by counting PaymentIntents in the Stripe
      Dashboard, not by trusting the UI.
- [ ] Row 11 verified by deliberately abandoning a paid, unsettled **Result** and
      finding it in the stuck queue.
- [ ] Row 22 performed by somebody who did not build it.
- [ ] Reader software version and update window recorded, so a mid-fitting reboot
      has a known cause.
- [ ] Any copy change from row 22 filed and shipped before the slice closes.
