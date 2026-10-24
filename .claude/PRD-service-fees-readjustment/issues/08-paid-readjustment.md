# 08 — Paid re-adjustment: service Order, Stripe Checkout, slot hold, webhook settlement, expiry

**Type:** AFK
**Blocked by:** 04, 07
**User stories:** 16, 18
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:checkout`

## Goal

This is the only re-adjustment slice that takes money. Demo:

1. A customer picks a Basic pillow (or *not listed*), a slot, and **Pay $30 and book**.
2. Stripe test card → back on the confirmation screen.
3. The **Order** is `confirmed` with one *Re-adjustment service* line, the ledger row and receipt exist, and the calendar event and reminder exist.
4. Abandon a second checkout: 30 minutes later the **Order** is `cancelled`, the hold is gone, and no event was ever created.

## The idea this slice implements

**Every dollar we take is an Order.** A paid re-adjustment is a pending **Order** with one `kind = 'service'` line, settled by the `checkout.session.completed` branch every shop order already uses (`app/api/stripe/webhook/route.ts`, the `order_id` path). That branch gives us these for free:

- `confirmed` + `paid_at`
- the money ledger
- the receipt email
- refunds, disputes and Analytics

Inventory deduction is already a no-op for a variant-less line (`lib/ecommerce/inventory-deduction.ts:139`). The only new webhook code is what to do **after** the money is in: book the slot.

**`deductInventoryForOrder`, the ledger writer and the refund paths must not be modified by this slice.** If one needs a change, the premise is wrong.

## Scope

### `POST /api/readjustments/checkout`

1. **Customer:** `getAuthUser()` → `linkCustomerToAuthUser()`, otherwise 401.
2. **Purchase:**
   - Platform: re-derive the line exactly as slice 07 does, re-run `evaluateReadjustment`. A complimentary quote → 409 (*use the free path*).
   - Unlisted: take `{ where, reference }` from the body, with `fee = service_prices.readjustment`.
3. **Amount:** from `loadServicePrices`. **The route accepts no amount in its body** (ADR 0001).
4. **Slot:** re-check `freeBusy` together with live holds.
5. **Booking:** insert `status = 'awaiting_payment'`, `complimentary = false`, `fee_amount`, `hold_expires_at = now() + interval '30 minutes'`.
6. **Order:** insert a pending **Order**:
   - `customer_id`, `email` (the account email)
   - `subtotal = total = fee`, `shipping_amount = 0`, `tax_amount = computeTax(...)` (0 today)
   - no shipping address
   - one `order_items` row: `kind = 'service'`, `service_key = 'readjustment'`, `product_title = 'Re-adjustment service'`, `variant_title = '{product_label} · Order #{n}'` (or *"Not listed — {where}"*), `quantity 1`.
   - Then set `readjustment_bookings.fee_order_id`.
7. **Stripe Checkout Session** (`mode: "payment"`):
   - one ad-hoc `price_data` line (no Stripe Price object, the same as a **Result** top-up, `lib/authorization-hold/index.ts:191-206`)
   - `customer_email`, `expires_at = hold_expires_at` (Stripe's minimum is 30 minutes)
   - `metadata { order_id, purpose: "readjustment", readjustment_booking_id }`
   - `success_url` → `/[lang]/appointments/confirmed?booking={id}`, `cancel_url` → back to the summary
   - idempotency key `readjustment-checkout-${bookingId}`
8. Store `stripe_session_id` on the **Order** and return `{ url }`.

**Double-press:** a second call for the same customer, line and slot while a live hold exists returns the **existing** session URL, not a second **Order**.

### Webhook — one new step, one new branch line

- **`checkout.session.completed`**, after the existing `order_id` branch finishes: when `metadata.purpose === "readjustment"`, call `finalizeReadjustmentBooking(bookingId)` (`lib/readjustment/finalize.ts`).
  - **Idempotent:** return early if `calendar_event_id` is set or the status is not `awaiting_payment`.
  - **Slot check:** re-check `freeBusy`. If free → `bookSlot` (slice 07's extracted tail) → `calendar_event_id`, `status = 'booked'`, `hold_expires_at = null`.
  - **Conflict** (someone wrote straight into Google Calendar while they paid) → `status = 'needs_reschedule'`. Send a Telegram alert to the measurements group (customer, pillow, paid order, the time they wanted) and email the customer that we will contact them to re-time it. **The money stays**, attached to a confirmed **Order**.
- **`checkout.session.expired`**: the existing branch cancels the pending **Order** by `stripe_session_id` (`app/api/stripe/webhook/route.ts:452-480`). Add: when `metadata.purpose === "readjustment"`, set the booking `expired`.
- **Late or missing expiry webhook:** reads already ignore holds past `hold_expires_at`, so a late webhook only tidies a status.

### Emails

The shop order confirmation and receipt (step 8 of the order branch) must read correctly for a service-only **Order**: no shipping block and no "we'll let you know when it ships". Show *"Re-adjustment · {studio} · {date time}"*. Add a service-only variant to the template rather than a new email type.

### Confirmation page — `app/[lang]/appointments/confirmed/page.tsx`

- **Paid:** reads the booking (customer-scoped, RLS) and shows *Booked · Paid $30 · receipt sent*, plus the `.ics`.
- **Still `awaiting_payment`** (webhook not in yet): shows *"Confirming your payment…"* and polls the booking for up to ~20 s, then falls back to *"We've got your payment and will confirm your slot by email shortly"*. It never shows a booked time the webhook has not yet written.

## Acceptance criteria

- [ ] Paid path (Stripe test mode): one **Order** `confirmed`, `paid_at` set, one ledger charge row, a receipt email, one calendar event, one reminder row, and the booking `booked` with `fee_order_id`.
- [ ] The **Order** has exactly one line, `kind = 'service'`, `service_key = 'readjustment'`. It is never in the ship queue and has no Easyship rate or label.
- [ ] Unlisted path: same as above, with `purchase_source = 'unlisted'` and *where* and *reference* stored.
- [ ] A complimentary-eligible line posted here → 409. An amount in the body is ignored, asserted by a test that posts one.
- [ ] Double-press and reload produce one **Order** and one Checkout Session.
- [ ] A replayed `checkout.session.completed` creates no second event.
- [ ] Abandoned checkout: the **Order** is `cancelled`, the booking `expired`, no event was ever created, and the slot shows as free again once `hold_expires_at` passes, even with the expiry webhook withheld.
- [ ] Slot taken in the calendar between checkout and payment: booking `needs_reschedule`, the Telegram alert is sent, the customer is emailed, and the **Order** stays `confirmed`.
- [ ] While a hold is live, another customer's slot grid does not offer that slot, and both book routes refuse it.
- [ ] `inventory-deduction.ts`, `money-ledger.ts` and the refund routes have zero diff.

## Notes

Confirm on the live Stripe endpoint that `checkout.session.completed`, `checkout.session.async_payment_succeeded` and `checkout.session.expired` are all subscribed. The handlers exist, so they almost certainly are, but slice 11 checks against the Dashboard rather than the code.
