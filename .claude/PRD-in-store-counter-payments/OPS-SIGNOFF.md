# Slice 08 — Sign-off runbook: one real reader, one real card, one real Singapore dollar

Parent: PRD `in-store-counter-payments` · checklist of record: `issues/08-signoff.md`
ADR: `docs/adr/0017-in-store-counter-payments.md`
Code under test: _not yet built — fill in the merge commit and PR number when slices 01–07 land_

Fill in the result table at the bottom. Slice 08 exists because everything above it
is verified against Stripe's **simulated reader**, which models the API faithfully
and the physical situation not at all.

---

## 0. Where to run it — decide this first

Unlike PRD `staff-assisted-customisation`'s sign-off, **this one cannot run purely
locally**, and the reason is the reader rather than the code.

A **Card reader** talks to *Stripe*, not to your laptop. In a server-driven
integration there is no local-network relationship between the **Admin Panel** and
the reader at all — both independently reach Stripe. So:

- **The reader must be registered to a live or sandbox Stripe account**, and it
  processes against whichever mode its registration and your API key agree on. A
  reader registered in sandbox will not take live payments and vice versa.
- **Webhooks must reach the code under test.** For the sandbox rehearsal (rows
  1–13) run `next dev` with `stripe listen --forward-to localhost:3000/api/stripe/webhook`,
  which is the only way `payment_intent.succeeded` and the two
  `terminal.reader.action_*` events reach a local build.
- **Rows 14–18 are live mode and must run against `custom.mpillow.com`**, because
  live-mode webhooks go to the configured endpoint and nowhere else.

So: rows 1–13 local with `stripe listen` and a sandbox-registered reader. Rows
14–18 on production with the reader re-registered live. Rows 19–22 wherever rows
14–18 ran, on a real handset.

**Re-registering the reader between modes is expected and is not a fault.** Note
the time you did it; a reader that appears offline immediately afterwards is
usually still switching.

---

## 1. Prerequisites

- [ ] Smart reader on the MELLOW LIFE account (`acct_1UEobvCMlMx7bA76` live,
      `acct_1UEocJFmfnDU9wZa` sandbox). **Stripe Reader S710** recommended — 4G LTE
      means shop-WiFi trouble is not a payments outage.
- [ ] Physical Stripe test cards, for live-mode rehearsal before a customer's card
      is involved.
- [ ] `we_1UEpVxCMlMx7bA76xFJYdCCj` subscribed to `payment_intent.succeeded`,
      `terminal.reader.action_succeeded`, `terminal.reader.action_failed` — 12
      events, up from 9.
- [ ] Endpoint host is `custom.mpillow.com`. Stripe does not follow redirects and
      `work.mpillow.com` 308s; that has already broken delivery on this account.
- [ ] **Terminal Location** registered for Chai Chee with its real address
      (slice 02), country SG.
- [ ] Counter payments toggled **on** (slice 07).
- [ ] An assigned **Result** with a real price to charge, and a second one for the
      retry rows.

---

## 2. Result table

| # | Case | Mode | Expected | Result | Notes |
|---|------|------|----------|--------|-------|
| 1 | Contactless tap | sandbox | Approved, **Order** `delivered` | | |
| 2 | Chip insert + PIN | sandbox | Approved | | |
| 3 | Declined test card | sandbox | Mapped copy, no **Order** | | |
| 4 | Retry after decline | sandbox | One **Order**, **one** PaymentIntent | | |
| 5 | Cancel while waiting | sandbox | Nothing charged, reader idle | | |
| 6 | PayNow scan | sandbox | Approved via same path | | |
| 7 | Reader unplugged before | sandbox | `reader_offline`, link offered | | |
| 8 | Reader unplugged mid-payment | sandbox | No **Order**, no charge | | |
| 9 | Page reload mid-payment | sandbox | Resumes correct state | | |
| 10 | Double-press *Charge* | sandbox | One PaymentIntent | | |
| 11 | Approved then abandoned | sandbox | `stuck` / `topup_unsettled`; settles with no 2nd charge | | |
| 12 | Re-assign mid-charge | sandbox | Refuses, old amount not charged | | |
| 13 | Counter payments off | sandbox | Explains itself; link still works | | |
| 14 | Real card, smallest build | **live** | Live SGD in MELLOW LIFE | | |
| 15 | Stripe receipt | **live** | Arrives, names MELLOW LIFE | | |
| 16 | Refund through RMA | **live** | Refunds against the charge | | |
| 17 | Money ledger + margins | **live** | Match the **Order** total | | |
| 18 | Attribution | **live** | Timeline + **Order** name the **Staff** member | | |
| 19 | Whole flow at 375px | either | No h-scroll, 44px targets | | |
| 20 | `waiting_for_card` at arm's length | either | Readable without leaning in | | |
| 21 | Both locales (`en`, `zh`) | either | No overflow, no untranslated strings | | |
| 22 | Unaided assistant | either | Completes a sale with no narration | | |

**Rows 4 and 10 must be verified by counting PaymentIntents in the Stripe
Dashboard, not by trusting the UI.** The UI showing one charge is exactly what a
double-charge bug would also show.

**Row 22 is the acceptance test for slice 04's copy.** If the assistant needs
narration, the finding is a copy change to file and ship before this slice closes,
not a training note.

---

## 3. Sign-off

| Field | Value |
|---|---|
| Tester | |
| Date | |
| Reader model + serial | |
| Reader software version | |
| Update window configured | |
| Live PaymentIntent id (row 14) | |
| Refund id (row 16) | |
| Copy changes filed | |
| Outcome | |

Record the reader software version and update window: a smart reader restarts to
apply updates automatically, and a reboot mid-fitting with no recorded cause is the
kind of thing that gets blamed on the code.
