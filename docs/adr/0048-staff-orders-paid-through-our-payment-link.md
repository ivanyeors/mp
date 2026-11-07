# A Staff order is priced on the server and paid through our own payment link, which opens a fresh Stripe Checkout each time

Status: Accepted (PRD `staff-orders-payment-links`, 2026-11-07).

**Staff** at the counter or on the phone with a customer had no way to sell them anything that
was not a customised build. An ear pad, a spare case, a re-adjustment or a measurement visit
could only be paid by the customer finding it in the shop themselves (Services are not in the
shop at all), and the one Staff route that wrote an **Order** (`POST /api/shop/orders`) took its
prices from the request body, against ADR 0001, and had no screen. The owner asked for Staff to
build an order from a **Customer**'s page, add products and services, and email the customer a
link to pay with a card on their own device.

## Decision

**A Staff order is a pending Order, built from the Customer page and priced on the server. The
customer pays it through our own Payment link, `/{lang}/pay/{token}`, which opens a Stripe Checkout
Session for the Order's stored total each time it is used. The Order is settled by the shop branch
of the Stripe webhook, unchanged.**

- **Staff choose what and how many, never an amount (ADR 0001).** Goods are **Variant**s at
  `product_variants.price`, the **MSRP** mirror the shop charges. **Services** are at their
  **Costings** MSRP (`service_prices`, ADR 0024) and become `kind = 'service'` lines. The only way
  to take money off is a **Discount code**, checked as checkout checks it against the
  **Customer**'s own account, and taken off the goods only, never a **Service fee**. No points
  (ADR 0030 keeps them to the customer's own checkout) and no **Referral**.
- **Which goods.** Any active Variant of a Storefront product that is not archived, except a
  pillow or bolster: those are customised builds, a **Result**, which Staff already settle from
  Results with *Request payment*. A `draft` product may be sold: it is not **Listed** online, but
  it was priced when it was **Pushed** (ADR 0045), and selling at the counter is not the shop.
  Stock is checked per Variant as checkout checks it, when the order is made and again every time
  the customer opens Checkout.
- **Where it goes.** Either handed over at a studio, an own **Location**, stored as a
  **Self-collect** address (the studio's, with the customer as recipient and the
  `collect_location` marker), so it is never born delivered and no courier label is bought for it;
  or delivered by a delivery **Shipping method** to an address, priced exactly as checkout prices
  it: a flat method's `base_rate` (free above its threshold on the goods), a live method's
  **Live rate** for the goods. A service-only order is at the studio. Self-collect methods are not
  offered: the studio option is that, free.
- **The total is fixed when the order is made.** Every line, the shipping, the discount and the
  tax are written on the **Order**; the Payment link charges exactly that, as an **Authorization
  hold** charges what was authorised. A Costings change after the link went out does not move it.
  The link's lifetime bounds how stale it can get.
- **The Payment link is ours, not Stripe's.** One per Order, in a service-role-only table
  (`order_payment_links`): a uuid token, its expiry (7 days), who made it and when it was last
  sent. The page shows what is in the order and its total, and **Pay** opens Stripe's hosted
  Checkout (card, Apple Pay, Google Pay, PayNow: whatever the account offers). A resend renews
  the 7 days. Copy link is there for WhatsApp.
- **One open Checkout per Order.** A Checkout Session lives at most an hour (`SHOP_CHECKOUT_LIFETIME_MS`;
  Stripe allows 24, and a PayNow QR lasts one). An open one is reused; a new one is written onto
  `orders.stripe_session_id` only if that column still holds what was read, and the loser of a race
  expires its own session before anyone sees it. Staff cancelling the Order expires the open one,
  as cancel already does.
- **Settlement is the shop's.** The session carries `order_id` and `purpose: staff_order`.
  `checkout.session.completed` confirms the Order, writes the ledger, deducts stock, counts the
  coupon, updates the Customer's stats, sends the confirmation and receipt, and makes the label for
  a delivered order: all of it already there. The one change: a `staff_order` session that expires
  unpaid does not cancel its Order, because the link is still good. The daily job cancels a Staff
  order whose link has expired unpaid.
- **Permission: `orders`.** The button sits on the Customer page (`customers`), and creating,
  sending and cancelling are Order actions, each written to the Audit Log.
- **`POST /api/shop/orders` is retired.** It wrote an Order at prices from the request body, and
  nothing called it. `GET` (the orders list) stays.

## Considered options

- **Stripe Payment Links** (`buy.stripe.com/…`) — rejected. A link's metadata does reach the
  sessions it opens, so the webhook could settle it, but each link makes a Product and Price in
  the Stripe catalog per order, the link lives in Stripe where our cancel, expiry and stock check
  cannot reach it, its *one completed session* restriction is not a lock against two devices paying
  at once, and it is a second place the order's price lives.
- **Emailing the Checkout Session URL** — rejected. A session lives 30 minutes to 24 hours and a
  PayNow QR one hour; a customer who opens the email the next day gets a dead page. Stripe's
  recovery URL lasts 30 days but only after expiry, and is still Stripe's link, not ours.
- **Stripe Invoices** (`send_invoice`, hosted invoice page) — rejected. A new webhook path
  (`invoice.paid`), a Stripe Customer per buyer, Stripe-branded emails beside ours, and a second
  invoice number beside the order number, for what a Checkout Session already does.
- **Card reader at the counter** — out of scope. That is PRD `in-store-counter-payments` (Stripe
  Terminal), which settles a **Result**; a Staff order paid by link works the day it ships and
  needs no hardware.
- **Making every Staff sale a Result** — rejected. A Result is a customised build, with
  measurements, fillings and an assignment. An ear pad is not one.
- **Pricing on the client and posting the total** — rejected. ADR 0001; it is what the retired
  route did.

## Consequences

- New table `order_payment_links` (service role only). Its row is also how a reader tells a Staff
  order from a shop order.
- `checkout.session.expired` branches on `purpose = staff_order`; the daily job gains a sweep that
  cancels Staff orders whose link expired unpaid.
- A new transactional email, *Payment request*, editable under Email templates.
- `docs/data-flows/purchases-to-inventory.md`: Staff-made Orders are now created pending and sold
  by the webhook, like a shop Order.
- The Customer page shows **Create order** to Staff holding `orders`; the Order page shows the
  Payment link card for a Staff order.
