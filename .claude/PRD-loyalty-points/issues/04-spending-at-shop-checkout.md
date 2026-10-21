# 04 — Spending at shop checkout, reserved so it can never be spent twice

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** 02
**User stories:** 4, 5, 9, 13, 14
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:checkout`

## Goal

A signed-in customer who is not a partner takes S$5 or more off a shop order with points, up to
half the products' price. The points are reserved when Checkout opens, given back if it lapses,
and never given back after payment (rules h–l).

## Scope

**Checkout page** (`app/[lang]/shop/checkout/page.tsx`, beside the coupon row at `:600-613`):

- **When it appears.** A "Use points" control shows only for a signed-in Customer who is not a
  partner (rule r) and whose available balance is at least `points_min_redeem`.
- **What it shows.** The balance, and the most this order allows. The amount moves in S$1 steps
  and defaults to the maximum.
- **Fixed copy beside it:** "Points can't be used on custom pillows. Points used are not
  refunded."
- **The preview.** A server route works out the allowance from the session Customer, never from
  the request body (as `app/api/shop/coupons/validate/route.ts` does since migration slice 05).

**Checkout route** (`app/api/shop/checkout/route.ts`):

1. **Check the customer.**
   - `getCurrentCustomerId` must equal the Customer that the checkout email resolves to
     (rule h). Otherwise refuse with "Sign in with your account email to use points."
   - A partner is refused, using the same `getPartnerContext` the self-purchase block already
     calls (`:617`).
2. **Check the amount.**
   - a multiple of 100;
   - at least `points_min_redeem`;
   - at most `floor(points_max_share × (subtotal − other discounts))` in whole dollars;
   - at most the available balance.
3. **Add it to the discount.** Points join `discountAmount` after the coupon (`:613-641`). The
   label gains "+ Points" ("CODE + Points", or "Points" alone).
4. **Record it on the Order.** The pending Order stores `points_spent` and `points_discount`.
5. **Reserve.** After the Order insert and before the Stripe call,
   `reserve_points(p_customer_id, p_order_id, p_points)` runs. It is SECURITY DEFINER, service
   role only, and in one transaction it:
   - locks the Customer row (`select … for update`);
   - re-reads the balance;
   - inserts the `spend` entry, or returns `insufficient`.
6. **Release on a Stripe error.** If creating the Checkout Session throws,
   `release_points(p_order_id)` writes the `spend_release`.

**Webhook** (`app/api/stripe/webhook/route.ts`):

- `checkout.session.expired` (`:474-510`) and `checkout.session.async_payment_failed`
  (`:446-472`) call `release_points` for that Order. It is idempotent on
  `points_ledger_one_per_order`, and does nothing once the Order is paid.
- The paid path changes nothing: the `spend` entry is already the debit.

**Sweep.** The daily job releases any `spend` whose Order is `cancelled` or `payment_failed`,
or still `pending` 48 hours after creation, and which has no release yet.

**Refunds do not change (rule l).** Every refund path already pays cash only, capped at the cash
not yet refunded (`lib/ecommerce/admin-refund.ts:9-18`; `app/[lang]/settings/rma/actions.ts:157-164`).
A return therefore refunds cash first, and the points stay spent on what was kept. No refund
path writes a `spend_release`. This slice adds tests that pin that behaviour, and changes no
refund code.

**Display.**

- Order detail, the order confirmation email and the Admin order page show "Points used:
  N (−S$x)" as its own line, separate from the coupon.
- The Stripe receipt shows the combined label.

## Acceptance criteria

- [ ] **The race.** Two concurrent `reserve_points` calls whose total exceeds the balance: one
      succeeds and one returns `insufficient`. This is asserted with two `dblink` sessions, like
      `supabase/tests/customer-migration/assert-05-claim.sql`, and mutation-checked by removing
      the lock.
- [ ] **Who may spend.** Refused for a guest, a different signed-in Customer, the owner checking
      out under another email, and a signed-in partner. Accepted for the owner's own email.
- [ ] **Forged requests.** A request body with too many points, an odd step, below the minimum or
      above the cap is refused by the server.
- [ ] **Stripe totals.** The coupon and points add up to the Stripe `amount_off`, and the
      paid-time reconcile passes.
- [ ] **Release.** An expired session gives the points back exactly once, a replayed webhook
      changes nothing, and a paid Order never gives them back.
- [ ] **Refunds pinned.** Two S$50 items, S$20 of points, S$80 cash:
      - returning one through an RMA refunds S$50 cash;
      - returning the other then refunds the remaining S$30;
      - a full refund returns S$80;
      - no case writes a ledger entry.
- [ ] **Coupons unchanged.** Every existing coupon and checkout test passes unchanged.
- [ ] `./scripts/graphify update .` is run in the same commit.
