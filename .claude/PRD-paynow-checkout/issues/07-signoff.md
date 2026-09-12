# 07 — Sign-off: a real bank app, a real QR, a real Singapore dollar

**Type:** HITL
**Blocked by:** 05, 06
**User stories:** all
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:checkout`

## Why this cannot be AFK

PayNow's test mode renders a QR that resolves to a Stripe-hosted test page, which
models the API and not the situation. What only a human with a Singapore bank
account can establish:

- The QR scans from a phone camera and a banking app, at the size hosted Checkout
  renders it.
- Money arrives in MELLOW LIFE, and the payout lands T+1 as documented.
- The statement really does read `STRIPE PAYMENTS SINGAPORE PTE. LTD.`, so slice
  06's copy is accurate rather than merely plausible.
- A real refund completes asynchronously and the ledger row appears **when it
  completes** — the one thing slice 02 exists for and the one thing a test mock
  cannot prove.

## Prerequisites

- [ ] **Stripe CLI re-authenticated to MELLOW LIFE.** It is currently logged in to
      the retired Mpillow account `acct_1Q7HmBFq5J2TJixu`; `stripe listen` from
      there forwards the wrong account's events and every row below would pass or
      fail for the wrong reason. Run `stripe login` and confirm
      `acct_1UEobvCMlMx7bA76` (live) / `acct_1UEocJFmfnDU9wZa` (sandbox).
- [ ] `we_1UEpVxCMlMx7bA76xFJYdCCj` subscribed to `refund.updated` (slice 02) —
      10 events, up from 9. Host must stay `custom.mpillow.com`; Stripe does not
      follow redirects and `work.mpillow.com` 308s, which has broken delivery here
      before.
- [ ] A Singapore bank account with a PayNow-participating app, for live rows.
- [ ] `npm run stripe:sync-all` has run against **live** — MELLOW LIFE live had 0
      products as of 2026-09-12, and a cart checkout cannot be tested without prices.

## Test matrix

Record every row in `../OPS-SIGNOFF.md`.

### Sandbox

| # | Case | Expect |
|---|---|---|
| 1 | Shop cart, SGD, from Singapore | PayNow offered beside card |
| 2 | Same cart with a non-SG billing country | PayNow absent, nothing broken |
| 3 | Pay a cart by PayNow | **Order** fulfils immediately, not held `unpaid` |
| 4 | Customisation submit → *Hold my card* | Unchanged from today; no PayNow offered |
| 5 | Customisation submit → *Pay in full* | PayNow offered; **Result** → `needs_assign` |
| 6 | Assign and accept a paid-in-full **Result** | **Order** created, **no** second charge |
| 7 | Final price below the paid amount | Difference refunded, or documented impossible |
| 8 | Result balance top-up by PayNow | Settles through the same path |
| 9 | Leave the QR untouched past 1h | Expiry copy, *Try again* gives a fresh QR |
| 10 | Abandon the QR entirely | Cart **Order** cancelled; **Result** untouched, timeline noted |
| 11 | Refund a PayNow order | Ledger row appears **on completion**, correct sign |
| 12 | Force a refund failure | `refund.failed` reversal posts once; order flagged |
| 13 | Refund a **card** order | Exactly **one** ledger row (the slice-02 regression) |
| 14 | Mixed-currency cart | Throws, names the variant |
| 15 | `authHoldEnabled` off | No radio pair; every submit pay-in-full; PayNow offered |

### Live

| # | Case | Expect |
|---|---|---|
| 16 | One real PayNow payment, smallest sellable build | Live SGD in MELLOW LIFE |
| 17 | Bank statement wording | Matches slice 06's copy exactly |
| 18 | Payout timing | Available T+1 |
| 19 | Refund it | Completes async; ledger and margins match |
| 20 | Confirmation email | One email, names descriptor and order number |

### Handset

| # | Case | Expect |
|---|---|---|
| 21 | Whole flow at 375px | No h-scroll, 44px targets |
| 22 | QR scanned from another phone | Scans first try at rendered size |
| 23 | Both locales (`en`, `zh`) | No overflow; refund sentence fits |
| 24 | Someone who has not seen it | Picks an option without asking which is which |

## Acceptance criteria

- [ ] All 24 rows recorded with outcomes.
- [ ] Row 13 verified by counting ledger rows, not by trusting the admin UI.
- [ ] Rows 11 and 19 verified by watching the ledger **before and after** the refund
      completes — a row that was already there proves nothing.
- [ ] At least one live PayNow payment settled and refunded end to end.
- [ ] Row 24 performed by somebody who did not build it; a copy change from it is
      filed and shipped before this slice closes.
