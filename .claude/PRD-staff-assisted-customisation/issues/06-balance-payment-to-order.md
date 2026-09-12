# Assisted customisation 06: A Result with no hold is payable — Balance payment to Order

Tracker: not yet filed (published locally)
Parent: PRD `staff-assisted-customisation` (`.claude/PRD-staff-assisted-customisation/staff-assisted-customisation-prd.md`)
Status: **Not started.**
User stories covered: 11, 12, 17–21

## What to build

The money slice. It is the smallest diff in the initiative and carries all of its risk, because everything it touches is on the path that creates **Orders** and charges cards.

**The idea.** A full payment is a top-up from a hold of zero. `createTopUpCheckout` is already an immediate-capture Stripe Checkout Session tagged `purpose: "result_topup"`; the webhook branch at `app/api/stripe/webhook/route.ts:95` already stamps `topup_payment_intent_id` and `topup_paid_at` on an `assigned` **Result**, including for the customer who paid and closed the tab; and `accept` is already re-entrant, settling from a stored intent rather than charging twice. Point a no-hold **Result** at that machinery and the whole settlement path already works. **No new Stripe concept, no new route, no webhook change.**

**Four guards, and the asymmetry between two of them.** `transitionResult` refuses both `accept` and `capture` without a `payment_intent_id`. These look symmetrical and are not. `accept` is reachable only from `assigned`, which already requires **Staff** assignment and a confirmed **Filling Template**, so the check adds nothing there — and in the deferred flow `accept` is the step that *creates* the Checkout, so it must run before any money exists. Drop it. `capture` is the transition that must never happen without money: it keeps its guard and takes on the whole job, admitting a captured hold **or** a paid **Balance payment**. After this slice, that one condition is the only thing standing between the system and an unpaid **Order**. Treat it accordingly.

**`planCapture` stops throwing at zero.** It currently rejects a non-positive authorized amount outright. It returns `{ kind: "top_up", holdCapture: 0, topUp: finalAmount }` instead, so a no-hold **Result** takes the existing top-up branch for its whole total and every positive-hold case is untouched.

**`accept/route.ts`, four edits.** Drop the `authorized == null` 400. Skip `captureHold` entirely when the hold capture is zero — there is no intent to capture, and calling Stripe with a null id is the obvious way to turn this into a 502 loop. Fall `payment_reference` back to the balance intent, so the **Order** records the charge that actually happened. Omit the zero-amount hold charge from the ledger rows: `recordLedgerEntry` must write exactly one `charge` for the balance intent, because a phantom zero row makes `summarize()` read a captured total that no refund can reconcile against.

**The copy on the Checkout.** `createTopUpCheckout`'s product description reads *"Additional charge because the final total exceeds your authorization hold."* A customer paying in full has no hold and no idea what that means. A variant for the full-payment case, naming the pillow.

**The dead end becomes the payment.** `app/[lang]/results/[id]/page.tsx:429` renders, for `status === "assigned" && !hasPaymentHold`, a paragraph telling the customer to go and complete the online purchase path. Replace it with **Pay SGD X** and the existing Decline. `canDecide` currently reads `status === "assigned" && hasPaymentHold`, which hides both buttons without a hold; it becomes a question about status alone. The top-up return path the page already implements — `?topup_session_id=`, resume, re-enter `accept` — carries the full payment with no change.

**What must stay true.** Inventory is deducted once, on successful payment, never on submit or assign. The **Order** is born `confirmed`, not `delivered`: `inStoreHandover` keys on `source === "manual" || shipping_address == null`, and an assisted **Result** has neither property — this needs no code change, which is exactly why it needs a test, since `delivered_at` anchors the RMA **Return window** and partner **Commission** release.

Demoable outcome: a customer opens the priced email, presses Pay, completes Stripe Checkout, and lands back on a status page reading "In production" — with an **Order** carrying the customisation snapshot, a balanced ledger and inventory deducted exactly once.

## Acceptance criteria

- [ ] `accept` succeeds from `assigned` with no `payment_intent_id`.
- [ ] `capture` refuses when there is neither a captured hold nor a paid **Balance payment**.
- [ ] `capture` succeeds on a no-hold **Result** once the balance is paid, and is unchanged for a captured hold.
- [ ] `planCapture(final, 0)` returns `{ kind: "top_up", holdCapture: 0, topUp: final }`; every positive-hold case is unchanged.
- [ ] `accept` on a no-hold `assigned` **Result** returns a Checkout URL rather than a 400.
- [ ] `captureHold` is never called when the hold capture is zero.
- [ ] The **Order** records exactly one `charge` ledger row, for the balance intent, and `payment_reference` is that intent.
- [ ] `amount_captured` equals the amount Stripe actually took, and `rollupOrderMoney` reconciles against the order total.
- [ ] A customer who pays and never returns is settled from the stored intent on the next `accept`, and is not charged twice.
- [ ] Inventory is deducted once, only after successful payment.
- [ ] An assisted **Order** is born `confirmed` with a null `delivered_at`; an in-store `manual` **Result** is still born `delivered`.
- [ ] The status page shows **Pay SGD X** and Decline for a no-hold `assigned` **Result**, and the in-store dead-end paragraph is gone.
- [ ] Decline on a no-hold **Result** still records the snapshot and attempts no hold release.
- [ ] The Checkout description for a full payment does not mention an authorization hold.
- [ ] No change to `app/api/stripe/webhook/route.ts`.
- [ ] `npm run ci` passes.
- [ ] `./scripts/graphify update .` run and the refreshed graph committed alongside the code.

## Blocked by

- 05 (the customer must have been told the build is ready and priced)
- Deploy together with 05 — neither is useful alone and 05 alone is misleading.
