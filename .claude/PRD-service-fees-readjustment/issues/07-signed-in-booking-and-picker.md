# 07 — Signed-in re-adjustment booking: sign-in gate, purchase picker, complimentary visit end to end

**Type:** AFK
**Blocked by:** 06
**User stories:** 12, 13, 14, 15, 17, 19
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:appointments`

## Goal

This is the customer tracer bullet, and it moves no money. Demo:

1. A signed-out visitor taps **Readjust**, is asked to sign in and told why.
2. They come back to a list of their own pillows, pick the Premium one bought last month (badge *Complimentary until 12 Dec*), and choose a studio and slot.
3. They confirm, and the calendar event, reminder row and **Re-adjustment booking** exist.
4. They book again: the badge now reads *$30 · free visit used*, and the pay button is disabled with *"Paid re-adjustments open in the next release"* until slice 08.
5. They cancel the first by WhatsApp: the free visit comes back.

## Scope

### The gate — `app/[lang]/appointments/page.tsx`

- **Signed out:** when `type === 'readjustment'` and `getAuthUser()` is null, render a **Sign in to book a re-adjustment** panel instead of the flow:
  - Copy: *"We need to know which pillow is coming in and when you bought it. It's how we know whether your visit is free."*
  - One button to `/account/login?next=<encodeURIComponent(withLocale('/appointments?type=readjustment' + item))>`, the pattern at `app/[lang]/results/page.tsx:19-23`.
  - Keep `?item=` through the round trip.
- **Signed in:** call `linkCustomerToAuthUser()` (`lib/auth/customer-identity.ts:67`), which also backfills guest orders by email, and pass `listReadjustablePurchases()` (slice 06) to the client as initial data.
- **Unchanged:** `type=customisation` stays guest-friendly. Only re-adjustment is gated.

### The picker — `components/slide-in-pages/readjustment-purchase-picker.tsx`

- **Cards:** product image (`order_items.image_url`), *Premium Mpillow · Size M*, *Order #1042 · bought 3 Sep 2026*, and a badge from the server's quote:
  - *Complimentary · until 12 Dec*
  - *$30*
  - *$30 · free visit used*
  - *$30 · complimentary window ended 3 Nov*
- **Preselection:** one purchase means it is preselected. `?item=<order_item_id>` preselects it if it belongs to the customer, and is ignored otherwise.
- **Last option:** *My pillow isn't listed →* always. Its form (where bought, optional reference) is built here; it books in slice 08 because it is always paid.
- **Empty state:** *"We couldn't find a pillow or bolster on this account."*, with *Switch account* (sign out, then back to the gate) and *My pillow isn't listed →*.
- **Mobile:** follows the configurator's mobile card pattern, with 44 px targets (`max-md:min-h-11`, as in `booking-flow.tsx`).

### The flow — extend `components/slide-in-pages/booking-flow.tsx`

- **Order:** for `type === 'readjustment'` the sequence becomes **picker → studio → date → slot → details → summary**. The studio, date and slot controls are reused as they are.
- **Details:** prefilled from `customers` (name, phone, email). Email is read-only and equals the account email, so the Google invite (`sendUpdates: "all"`) and the purchase identity cannot diverge.
- **Summary:** *Re-adjustment · Premium Mpillow · Size M · Order #1042 · {studio}, {date} {time}* plus **Complimentary** → *Confirm booking*.

### The route — `POST /api/readjustments/book` (complimentary only)

1. `getAuthUser()`, then `linkCustomerToAuthUser()`, otherwise 401.
2. Re-load the purchase by `order_item_id` with the service role, joined to `orders`, `.eq("customer_id", customer.id)`, as `app/api/account/orders/[orderNumber]/rma/route.ts:52-61` does. A line that is not the customer's → 404.
3. Re-run `evaluateReadjustment`. A charged quote → 409 `{ quote }`, so the client re-renders the price. The client's belief that a visit is free is never trusted.
4. Re-check `freeBusy` together with live holds (`readjustment_bookings` in `awaiting_payment` with `hold_expires_at > now`).
5. Insert the booking: `complimentary = true`, `complimentary_seq = quote.seq`, `status = 'booked'`. A unique-index violation → 409 with a re-quote. Insert **before** the calendar call. If the insert fails nothing was booked; if the calendar call fails, mark the row `cancelled` and return 502.
6. `createEvent` (`lib/appointments/calendar.ts`):
   - summary unchanged (`"{name} - {readjustmentSummaryMatch}"`), so type inference holds;
   - the description gains *"Pillow: Premium Mpillow · Size M · Order #1042 · bought 3 Sep 2026 · Complimentary"*;
   - `readjustment_booking_id` goes in a private extended property next to the Location id (`lib/appointments/slots.ts:224-242`).
7. Store `calendar_event_id`, then `upsertPendingReminder`, the WhatsApp confirmation and the Contacts sync, as in `app/api/appointments/book/route.ts:99-146`. Extract the shared tail of that route into `lib/appointments/book-slot.ts` rather than copying it.

### Lifecycle sync

A free visit has to come back when the appointment does not happen. Update the booking wherever the calendar event changes:

- **WhatsApp second rejection** cancels the event (`app/api/webhooks/whatsapp/route.ts:208-233`) → booking `cancelled`.
- **WhatsApp reschedule** patches times (`patchEventTimes`) → booking `start_at`/`end_at` updated, status unchanged.
- **Slot availability:** `/api/appointments/slots` subtracts live holds, which slice 08 creates. Wire the read here so 08 only writes.

## Acceptance criteria

- [ ] Signed out, `?type=readjustment` shows the gate. After sign-in the customer lands back on the flow with `?item=` intact.
- [ ] The picker lists only the signed-in customer's pillows and bolsters, newest first, with the server's badge. One purchase is preselected.
- [ ] A complimentary booking creates exactly one booking row, one calendar event (description and private property as above) and one reminder row.
- [ ] Posting another customer's `order_item_id` → 404. Posting a charged line to this route → 409 with the quote.
- [ ] Two simultaneous complimentary submits for the last free visit produce one booking and one 409.
- [ ] Cancelling via WhatsApp sets the booking `cancelled`, and the same pillow quotes *Complimentary* again.
- [ ] `type=customisation` booking is unchanged (existing tests green).
- [ ] The extracted `lib/appointments/book-slot.ts` is used by both book routes. `app/api/appointments/book/route.ts` keeps its behaviour and tests.
