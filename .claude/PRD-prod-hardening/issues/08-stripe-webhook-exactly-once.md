# 08: Stripe webhook exactly once and safe to retry: atomic claim, checked writes, honest status

**Type:** AFK
**Blocked by:** none. **Related:** `refund.updated` is owned by PayNow slice 02 (#143). Don't add it here.
**User stories:** 19, 20, 21, 22, 23
**Labels:** `bug`, `needs-triage`, `P1`, `area:checkout`

## Goal

Every Stripe event either completes all of its side effects exactly once, or returns 5xx so Stripe retries.

## The gap, precisely

**Ignoring failures.** `app/api/stripe/webhook/route.ts:812-814` returns **200 for any error that isn't a `CriticalWebhookError`** (`:26`). So:
- A `recordLedgerEntry` throw (`lib/.../money-ledger.ts:124`) or an `addOrderTimelineEvent` throw (`orders.ts:95`) after the Order is confirmed (`:237-245`) acks the event.
- Stock deduction, commission and emails are then skipped. A replay skips them too, because `paid_at` is already set.

**Not atomic.** `:214-225` confirms the Order with `.eq("id", orderId)` only. Two concurrent deliveries both see `paid_at` null, so emails go out twice (`:398-404`) and the coupon is counted twice (`:362-369`).

**Unchecked database errors**
- **`:106-113`, `:119-123`:** stamping the top-up and hold `payment_intent_id` onto `mp_config_responses`. If the write fails, the Authorization hold is never recorded, so it can't be captured or released.
- **`:175-183`:** `const { data: order } = … .single(); if (!order) break;`. A transient DB error acks `checkout.session.completed`: the customer paid but the Order is never confirmed.
- **`:316-321`:** a stock idempotency count of `null` on error is treated as 0, so a retry double-deducts.
- **`:478-486`:** refund lookup `.single()` with no error check. **`:562-571`:** coupon decrement is read-then-write.
- **`lib/ecommerce/inventory-deduction.ts:168,184,204,225,232`:** insert errors are never checked, so the OVERSOLD path (`:322-343`) can never fire. Variants on manual tracking (`:241-246`) write no transaction row and deduct again on every redelivery.

**Unhandled event.** `payment_intent.canceled`: an expired 7-day Authorization hold makes accept retry capture forever (`app/api/results/[id]/accept/route.ts:196-205` returns 502).

**Handled today:** `checkout.session.completed`, `async_payment_succeeded`, `async_payment_failed`, `expired`, `charge.refunded`, `payment_intent.payment_failed`, `charge.dispute.created`, `charge.dispute.closed`, `refund.failed`.

## Scope

- **Atomic claim.** Confirm the Order with `.update({ paid_at, … }).eq("id", orderId).is("paid_at", null).select("id")`. Only the claimer runs emails, the coupon increment, commissions and stock. A non-claimer returns 200 with no side effects.
- **Retry-safe steps.** Every step after the claim must be idempotent on a retry *by the claimer*:
  - ledger: already unique on `stripe_object_id`
  - commissions: already unique on `order_item_id`
  - stock: one transaction row per order item, including manual-tracking variants, guarded by a unique key or by the count check with its error checked
  - emails: a sent marker on the Order
- **Check `error`** on every write and read listed above, and throw.
- **Honest status.** The top-level catch returns 500 for all errors, not only `CriticalWebhookError`. Keep `recordWebhookFailure` for visibility.
- **Handle `payment_intent.canceled`.** When `metadata.result_id` or the Result's `payment_intent_id` matches, mark the hold expired on the Result so accept shows "hold expired, request payment" instead of 502.
- **Inventory deduction** throws on insert failure.
- **Dashboard:** subscribe the endpoint to `payment_intent.canceled` (a manual step; note it in the PR).

## Acceptance criteria

- [ ] vitest: delivering the same `checkout.session.completed` twice concurrently gives `paid_at` set once, one confirmation email call and one coupon increment. Fails on today's code.
- [ ] vitest: when `recordLedgerEntry` throws, the response is 500. A redelivery afterwards completes the remaining steps without duplicating the ones that already ran.
- [ ] vitest: a stock-count query error causes a 500, not a deduction.
- [ ] vitest: `payment_intent.canceled` for a held Result marks it expired, and accept then returns a clear non-502 response.
- [ ] Stripe sandbox: `stripe events resend <evt>` on a completed checkout produces no second email and no second stock row.
- [ ] The endpoint is subscribed to `payment_intent.canceled` in both accounts (checkbox for the human doing it).
