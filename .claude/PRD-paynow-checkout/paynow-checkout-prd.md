# PRD — PayNow at checkout

**Status:** specified, not started
**ADR:** `docs/adr/0018-paynow-checkout.md` (to be written by slice 01)
**Stripe account:** MELLOW LIFE PTE. LTD. — `acct_1UEobvCMlMx7bA76` (live),
`acct_1UEocJFmfnDU9wZa` (sandbox). No other account is in scope.

## Problem statement

PayNow is how Singapore pays. Every shopper on this site is presented an SGD price
by a Singapore company, and the only way to pay today is a card. A shopper who
would have scanned a QR in four seconds instead types sixteen digits, or leaves.

It is also materially cheaper: **1.3%** flat against a card's blended SG rate, on a
product whose **Costings** margins are computed to the cent. On a S$610 pillow that
is roughly S$13 of margin per order, recovered by changing nothing about the
product.

## What the audit found, before designing anything

This is not a greenfield feature. Most of it is already on, and the parts that are
missing are not the parts anyone would guess.

### PayNow is already enabled on the account

Verified against both accounts via the Stripe API on 2026-09-12 — the default
payment method configuration reports, in **live and sandbox**:

```
paynow: { available: true, display_preference: { preference: "on", value: "on" } }
```

There is **no Dashboard enablement step**. Anyone planning this work should not
budget for one.

### So it is already reachable on two of the three checkout paths

This codebase creates three real Checkout Sessions. Their eligibility follows
entirely from one parameter:

| # | Site | Capture | PayNow? |
|---|------|---------|---------|
| 1 | `createCheckoutSession` — `lib/stripe/checkout.ts:202` (shop cart) | automatic | **eligible today** |
| 2 | `createHoldCheckout` — `lib/authorization-hold/index.ts:53` (customisation submit) | `manual` | **impossible, permanently** |
| 3 | `createTopUpCheckout` — `lib/authorization-hold/index.ts:152` (settle / pay in full) | automatic | **eligible today** |

None of the three sets `payment_method_types`, so all three use dynamic payment
methods and Stripe picks per shopper.

**Measured, not inferred** (MELLOW LIFE sandbox, 2026-09-12): an SGD
automatic-capture session returns `card, link, paynow`; the same session with
`capture_method: "manual"` returns `card, link`; a USD automatic-capture session
returns `card, link`. Sites 1 and 3 are already offering PayNow to a Singapore
shopper today. Site 2 never will, and no amount of code changes that.

Note what row 2 means in practice: adding manual capture does not error, it
silently returns one fewer payment method. Nothing about the hold path announces
that PayNow is missing from it.

The codebase had already reasoned about this correctly once: the comment in
`app/api/stripe/webhook/route.ts` above the fulfilment gate already names PayNow as
a presentable method for this account and already classifies it as real-time rather
than delayed-notification. `lib/stripe/fulfilment-gate.ts` is therefore already
right, and slice work must not "fix" it.

### The blocker is a Stripe property, not a decision

Stripe's PayNow reference states **Manual capture support: No**.

Site 2 is the main customisation flow, and it exists to take an **Authorization
hold** — a manual-capture PaymentIntent, authorized at submit and captured when
Staff assign the build. PayNow cannot authorize. It can only pay.

So the honest statement of this initiative is:

> **A Singapore shopper cannot use PayNow on the customisation flow while that flow
> takes an authorization hold. Offering PayNow there means offering to be paid in
> full at submit instead.**

That is a product decision about money and refund risk, not an integration task,
and it is the centre of this PRD (slice 04). Everything else is consequence.

### The one real bug: an async refund is never recorded

`lib/stripe/refunds.ts` deliberately records nothing itself — its docstring says
callers "let the `charge.refunded` / `refund.*` webhook write the money-ledger row".
Five call sites rely on that: order cancel, refund-request approve, admin refund,
and the RMA action.

PayNow refunds are **asynchronous**. The sequence is:

1. `refundPayment` creates a Refund with status `pending`.
2. `charge.refunded` fires. The handler filters
   `charge.refunds.data` to `r.status === "succeeded"` — correctly, since the money
   has not moved — and so records **nothing**.
3. The refund succeeds. Stripe signals this with **`refund.updated`**.
4. `refund.updated` is **not handled anywhere in this repo.**

The money leaves the account and no ledger row is ever written. `refund.failed` *is*
handled, so the failure path is fine and the success path is silent — the worst way
round. The money ledger and margins under-report every PayNow refund, permanently.

This is not hypothetical once PayNow is live, and it is not caused by PayNow —
PayNow is merely the first payment method on this account that refunds
asynchronously. It must ship **before** PayNow carries volume (slice 02).

## Solution

Stated as one sentence, because it keeps the work small:

> **PayNow is already on. This initiative makes the codebase honest about what
> PayNow does differently — asynchronous refunds, a one-hour QR, a statement
> descriptor that is not ours, and no chargebacks — and makes one product decision
> about the flow that cannot have it.**

## User stories

**Shopper, shop cart**

1. As a Singapore shopper buying an in-stock item, I see PayNow beside card at
   checkout and pay by scanning with my banking app.
2. As a shopper outside Singapore, I am not offered PayNow and see no broken option.
3. As a shopper who paid by PayNow, my order is fulfilled immediately — not held
   pending like a bank transfer.

**Shopper, customisation**

4. As a Singapore shopper submitting a customisation, I can choose to pay in full
   now by PayNow instead of authorizing a card hold.
5. As a shopper who chooses to pay in full, I am told plainly that the final price
   may be lower and the difference will be refunded, and that a PayNow refund takes
   a few days.
6. As a shopper who prefers not to pay before the build is priced, the card hold
   remains available and is still the default.
7. As a shopper settling a final balance on my **Result**, PayNow is offered there
   too.

**Shopper, failure**

8. As a shopper whose QR code sat untouched for an hour, I am told it expired and
   offered a fresh one rather than an error.
9. As a shopper who abandoned the QR entirely, my order does not sit pending
   forever.
10. As a shopper checking my bank statement, I can tell what the charge was — even
    though it reads `STRIPE PAYMENTS SINGAPORE PTE. LTD.` and not MELLOW LIFE.

**Staff / ops**

11. As Staff refunding a PayNow order, the money ledger records the refund when it
    actually completes, and margins match.
12. As Staff, a PayNow refund that fails is visible and flagged, as a card one is.
13. As Staff, I can see which instrument an order was paid with, because the
    support conversation differs.
14. As the business, I can tell how much of revenue came through PayNow, since the
    fee difference is the reason to care.

## Non-goals

- **GrabPay.** Available in SG on this account's country, currently `available: false`,
  and a second wallet does not answer a question PayNow leaves open.
- **PayNow on Terminal / at the counter.** Belongs to `PRD-in-store-counter-payments`
  slice 06 (issue #138) and must not be built twice.
- **PayNow subscriptions or invoicing.** Requires `send_invoice` collection and
  nothing here bills recurrently.
- **Removing the authorization hold.** The `authHoldEnabled` kill switch
  (`ce1fc950`) already exists for that and is an admin decision, not this PRD's.
- **Modelling Stripe fees in margins.** No fee is modelled today for cards either;
  introducing one for PayNow alone would make margins less comparable, not more.
- **A custom QR page.** Hosted Checkout renders the QR. Building our own means
  taking on PaymentIntent polling for no gain.
- **Non-SGD currencies.** PayNow requires every line item in `sgd`. Slice 03 guards
  it rather than supporting anything else.

## Risks

| Risk | Reality | Mitigation |
|---|---|---|
| Async refunds silently unrecorded | **Live gap today**, not a PayNow risk | Slice 02, ships first |
| Paying in full exposes us to refunding the difference | Real; final can be below quote | Slice 04 makes it opt-in with plain copy; hold stays default |
| QR expires in 1h, session lives 24h | Shopper sees a dead QR | Slice 05 |
| Expired **Result** top-up session leaves the Result waiting | `checkout.session.expired` only looks up `orders` by `stripe_session_id`; a Result session matches nothing | Slice 05 |
| "Who is STRIPE PAYMENTS SINGAPORE?" support load | Descriptor is not customisable, ever | Slice 06 copy |
| No chargebacks on PayNow | This is an **upside** — no dispute can claw funds back | Record in ADR; dispute handlers simply never fire |
| A non-SGD variant silently removes PayNow | Currency comes from `lineItems[0].variant.currency` | Slice 03 guard + check |
| Someone "fixes" the fulfilment gate to hold PayNow | Would strand every PayNow order as unpaid | Slice 03 check asserts real-time classification |

## Success criteria

- A Singapore shopper completes a shop-cart purchase by PayNow, and the order
  fulfils immediately.
- A Singapore shopper completes a customisation by paying in full via PayNow, and
  the **Result** enters the build queue.
- A PayNow refund appears in the money ledger with the right sign and amount, when
  it completes and not before.
- A non-SGD line item fails loudly at build time rather than silently dropping
  PayNow.
- Revenue is attributable by instrument.
