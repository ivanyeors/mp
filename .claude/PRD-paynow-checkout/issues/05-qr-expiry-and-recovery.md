# 05 — A QR that expires in an hour, and a session that does not strand anything

**Type:** AFK
**Blocked by:** 04
**User stories:** 8, 9
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:checkout`

## Goal

PayNow's failure mode is not a decline — it is a shopper who opened the QR, got
distracted, and came back to something dead.

## The mismatch

A **PayNow** QR is valid for **one hour**. A Checkout Session lives **24 hours** by
default. In between, the page is reachable and the QR is not: a payment attempted
against an expired QR fails with `payment_intent_payment_attempt_expired`.

Stripe's guidance is to bring the customer back to a fresh session rather than let
them retry a dead code.

- Set `expires_at` on PayNow-eligible sessions to ~1 hour so the session and the QR
  die together, and the shopper meets one honest "this expired, start again" rather
  than a page that looks fine and refuses.
- One hour is Stripe's minimum-friction choice here, but it shortens the window for
  a *card* shopper on the same session, who previously had 24. State the trade in the
  slice notes and prefer it: a stale card session recovers with one click, a stale QR
  does not recover at all.

## Recovery

- Expiry must return the shopper somewhere that offers a new attempt — for a
  **Result**, its status page with a *Try again* action; for a cart, the cart.
- Copy names the cause: "Your PayNow code expired after an hour. Nothing was
  charged — start a new payment when you're ready."

## The gap this slice must close

`checkout.session.expired` (`app/api/stripe/webhook/route.ts:440`) resolves the
session through `orders.stripe_session_id` and `break`s when nothing matches. A
**Result** hold or top-up session has no **Order**, so *every* expired Result
session already falls through this handler silently. Harmless while holds are
card-only and a shopper can just resubmit — but slice 04 puts real PayNow payment
attempts on that path, and "nothing was charged and nothing was said" becomes a
support ticket.

Handle the `result_id` case: leave the **Result** exactly as it was (it was never
paid), add a timeline entry, and make sure the status page offers a fresh attempt.

## Acceptance criteria

- [ ] PayNow-eligible sessions carry a ~1h `expires_at`, and the value is named in
      one place rather than repeated.
- [ ] An expired session shows expiry copy, not a generic error.
- [ ] `checkout.session.expired` carrying `result_id` is handled: **Result**
      unchanged, timeline entry written, no dead-letter noise.
- [ ] A cart session expiring still cancels its pending **Order** as it does today —
      regression-tested, since this slice touches that handler.
- [ ] *Try again* produces a fresh session and a fresh QR.
- [ ] Expiry copy in both locales, legible at 375px.
