# 06 — PayNow at the counter, and a receipt for a sale with no shipping email

**Type:** AFK
**Blocked by:** 03
**User stories:** 8, 9
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:checkout`, `area:email`

## Goal

Two small additions that matter disproportionately in Singapore, and which are
cheap only if they land before the charge path calcifies.

## PayNow (story 8)

**PayNow** is how Singapore pays, and Stripe supports it on Terminal smart readers:
the reader renders the QR on its own screen and the customer scans it with their
banking app. Supported on WisePOS E, Stripe Reader S700/S710 and Verifone
V660p/P630 — every reader this initiative can drive.

The change is one array element:

```ts
payment_method_types: ["card_present", "paynow"],
```

Three things make it worth its own slice rather than a one-line edit inside slice 03:

- **PayNow is real-time, not delayed-notification.** Stripe classifies it under
  *Real-time payments* — *"You receive confirmation from Stripe instantly"* — so it
  reaches `succeeded` like a card and needs none of the `unpaid`-then-settles
  handling that `checkout.session.async_payment_succeeded` exists for. This is
  worth stating in a comment because the instinct on seeing a QR-based method is to
  reach for the delayed-notification machinery, and that instinct produces a
  fulfilment gate that never opens. (The codebase already has the gate:
  `lib/stripe/fulfilment-gate.ts`, added because that reasoning was got wrong once.)
- **`capture_method: "automatic"` is required.** PayNow cannot be authorized and
  captured later. ADR 0017 decision (b) already chose automatic capture for every
  **Counter payment**, so this is compatible — but it is now load-bearing rather
  than merely preferable, and a future change to manual capture would silently
  break PayNow. Assert it.
- **The UI has to say which methods are on offer.** `waiting_for_card`'s copy
  becomes *Ask for the card, or let them scan to pay* when `paynow` is enabled, and
  the reader-side flow needs one extra state: the customer is scanning, which can
  take longer than a tap. Extend slice 04's 90-second cap for PayNow rather than
  timing out someone mid-scan.

Make it a per-**Location** setting (`partners.counter_paynow_enabled`, default
true) rather than global. Turning it off is how a shop with a flaky reader
firmware, or a partner **Location** that wants cards only, gets unblocked without
a deploy.

## Receipts (story 9)

An in-store sale produces an **Order** born `delivered` with `delivered_at = now`
(`app/api/results/[id]/accept/route.ts:255,268`), so the customer never receives a
shipping confirmation. If nothing else is sent, the only record of the purchase is
a pillow in a bag.

- `receipt_email` on the PaymentIntent when the **Result** carries a
  `customer_email`, so Stripe sends its own prebuilt receipt. Stripe retains a copy
  automatically, which is also the cheapest dispute evidence available.
- An in-store **Result** may have **no** email — `buildInstoreReviewOnlyPatch`
  requires none. So the counter control needs a small optional email field in
  `idle`: *Email a receipt to (optional)*. Filled, it is written to the **Result**
  and used for the receipt; empty, the sale proceeds without one. It must not be
  a blocker — a customer who does not want to give an email still gets a pillow.
- Check what `paymentReceipt()` in `lib/email/templates.ts:144` already sends and
  whether the existing **Order** confirmation reaches an in-store customer. If it
  does, Stripe's receipt may be redundant and the lazier answer is to send
  nothing new — **find out before building**, because two receipts for one sale is
  worse than one.

## Acceptance criteria

- [ ] `paynow` is included in `payment_method_types` when enabled for the
      **Location**, and absent when not.
- [ ] A self-check asserts `capture_method === "automatic"` wherever `paynow` is
      in the types, with a comment naming PayNow's inability to authorize.
- [ ] A comment in `lib/counter-payment/index.ts` records that PayNow is
      real-time, not delayed-notification, and links `lib/stripe/fulfilment-gate.ts`.
- [ ] `counter_paynow_enabled` is togglable per **Location** in settings, default on.
- [ ] `waiting_for_card` copy names both instruments when PayNow is on, and the
      timeout is extended for the scan case.
- [ ] `receipt_email` is set when the **Result** has an email; omitted cleanly when
      it does not.
- [ ] The optional email field writes to the **Result** and never blocks the charge.
- [ ] The existing in-store email behaviour is documented in the slice notes with
      a decision on whether Stripe's receipt duplicates it.
- [ ] A simulated PayNow payment reaches `succeeded` and settles into an **Order**
      through the same path as a card.

## Notes

Verify PayNow-on-Terminal against the MELLOW LIFE account's own enabled payment
methods before building. The account had PayNow enabled for online payments as of
2026-09-12, but Terminal availability is a separate capability and a sandbox check
is cheaper than discovering it at the counter.
