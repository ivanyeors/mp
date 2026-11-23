# Slice 07 — Sign-off runbook: a real bank app, a real QR, a real Singapore dollar

Parent: PRD `paynow-checkout` · checklist of record: `issues/07-signoff.md`
ADR: `docs/adr/0018-paynow-checkout.md`
Code under test: _not yet built — fill in the merge commit and PR number when
slices 01–06 land._

## 0. Where to run it

Rows 1–15 run in **sandbox** (`acct_1UEocJFmfnDU9wZa`) against `next dev` with
`stripe listen --forward-to localhost:3000/api/stripe/webhook`. Rows 11–13 in
particular cannot be observed without it, because the whole point is *when* the
ledger row appears.

Rows 16–20 run **live** on `custom.mpillow.com`, because live webhooks go to the
configured endpoint and nowhere else.

**Before anything:** `stripe login` and confirm the CLI is on MELLOW LIFE. It was
last seen authenticated to the retired Mpillow account `acct_1Q7HmBFq5J2TJixu`, and
`stripe listen` from there forwards a different business's events — every row below
would pass or fail for the wrong reason.

## 1. Prerequisites

- [ ] Stripe CLI authenticated to MELLOW LIFE (live `acct_1UEobvCMlMx7bA76`,
      sandbox `acct_1UEocJFmfnDU9wZa`).
- [x] `we_1UEpVxCMlMx7bA76xFJYdCCj` subscribed to `refund.updated` — 11 events, up
      from 10 (2026-11-23). Host `custom.mpillow.com`.
- [ ] A Singapore bank account with a PayNow-participating app.
- [ ] A second phone, to scan the QR the first one renders.
- [ ] `npm run stripe:sync-all` run against **live** (live had 0 products on
      2026-09-12; the live cart rows cannot run without prices).
- [ ] One assigned **Result** with a real price, and a second for the retry rows.

## 2. Result table

| # | Case | Mode | Expected | Result | Notes |
|---|------|------|----------|--------|-------|
| 1 | Cart, SGD, SG customer | sandbox | PayNow offered | | |
| 2 | Cart, non-SG country | sandbox | PayNow absent, nothing broken | | |
| 3 | Pay cart by PayNow | sandbox | **Order** fulfils, not `unpaid` | | |
| 4 | Submit → *Hold my card* | sandbox | Unchanged; no PayNow | | |
| 5 | Submit → *Pay in full* | sandbox | PayNow offered; `needs_assign` | | |
| 6 | Accept paid-in-full **Result** | sandbox | **Order**, no 2nd charge | | |
| 7 | Final below paid amount | sandbox | Difference refunded / documented | | |
| 8 | Balance top-up by PayNow | sandbox | Settles same path | | |
| 9 | QR untouched past 1h | sandbox | Expiry copy, fresh QR on retry | | |
| 10 | QR abandoned | sandbox | Cart cancelled; **Result** untouched | | |
| 11 | Refund a PayNow order | sandbox | Ledger row **on completion** | | |
| 12 | Force refund failure | sandbox | Reversal once; order flagged | | |
| 13 | Refund a **card** order | sandbox | Exactly **one** ledger row | | |
| 14 | Mixed-currency cart | sandbox | Throws, names variant | | |
| 15 | `authHoldEnabled` off | sandbox | No radio pair; PayNow offered | | |
| 16 | Real PayNow payment | **live** | Live SGD in MELLOW LIFE | | |
| 17 | Bank statement wording | **live** | Matches slice 06 copy | | |
| 18 | Payout timing | **live** | Available T+1 | | |
| 19 | Refund it | **live** | Async; ledger + margins match | | |
| 20 | Confirmation email | **live** | One email; descriptor + order no. | | |
| 21 | Whole flow at 375px | either | No h-scroll, 44px targets | | |
| 22 | QR scanned from another phone | either | Scans first try | | |
| 23 | Both locales (`en`, `zh`) | either | No overflow | | |
| 24 | Unaided shopper | either | Picks an option without asking | | |

**Row 13 is the regression row.** Slice 02 adds a second event that can write a
refund row, and a card refund emits both. Count ledger rows in the database; the
admin UI showing one refund is exactly what a double-post would also show.

**Rows 11 and 19 must be watched, not checked afterwards.** Look at the ledger
*before* the refund completes and again after. A row that was already there proves
the opposite of what the slice claims.

**Row 24 is the acceptance test for slice 04's copy.** If the shopper asks which
option to pick, that is a copy change to file and ship before the slice closes, not
a note for support.

## 3. Sign-off

| Field | Value |
|---|---|
| Tester | |
| Date | |
| Bank app used | |
| Live PaymentIntent id (row 16) | |
| Statement wording observed (row 17) | |
| Refund id + completion delay (row 19) | |
| Copy changes filed | |
| Outcome | |
