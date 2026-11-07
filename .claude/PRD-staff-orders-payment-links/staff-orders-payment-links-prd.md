# PRD: Staff orders and payment links — sell from the Customer page, let them pay on their own phone

Status: Built on `claude/sleepy-volta-auiwg9` (slices 01–05); sign-off (06) not started.
Source: Owner request, 2026-11-07: *"a logged in staff account goes into the customer page and creates an order, adds products and re-adjustment or customisation services; the payment link automatically becomes an order assigned to the customer; email them the link so they can pay from their own device; link our payment link to Stripe so they pay with a credit card on Stripe."*
ADR: `docs/adr/0048-staff-orders-paid-through-our-payment-link.md` (this initiative); `0001` (Costings is the one price), `0024` (Services are Order lines), `0033` (Discount codes), `0044` (labels at payment), `0045` (what reaches the shop).
Glossary: `CONTEXT.md` — new **Staff order**, **Payment link**, **Payment request**; uses **Customer**, **Order**, **Sale**, **Variant**, **Service**, **Service fee**, **Costings**, **MSRP**, **Discount code**, **Self-collect**, **Location**, **Live rate**, **Staff**.

## The request, organised

The ask has four parts. Each maps to one decision, and one of them maps to two terms the codebase
already uses.

| Owner's words | What it is here | Decision |
|---|---|---|
| "Create an order from the customer page" | A **Staff order**: a real **Order**, `pending`, `customer_id` set from the page | Built server-side from what Staff pick; Staff never type a price |
| "Add products" | Shop **Variant**s (accessories, cases, protectors, bundles) | At the shop's price; pillows and bolsters stay **Results** |
| "Re-adjustment services or customisation services" | The three **Service**s: Re-adjustment, Measurement (Premium), Measurement (Basic) — the measurement is the labour of a customisation fitting | At their **Costings** MSRP, as `kind = 'service'` lines |
| "The payment link automatically becomes an order assigned to the customer" | The Order exists, under the customer, the moment Staff make it; the link pays *that* Order | No second record to convert later |
| "Email them the link to pay from their own device" | The **Payment request** email, with a **Payment link** | Sent on create, resent from the Order page, copyable for WhatsApp |
| "Link our payment link to Stripe … pay with a credit card on Stripe" | Our link opens Stripe's hosted Checkout | Not a Stripe Payment Link object (see *Research*) |

## Problem Statement

Everything a customer can pay for today, they start themselves: the shop cart, the configurator,
a re-adjustment booking. **Staff** cannot sell to a customer they are talking to. A customer who
comes in for a fitting and wants a spare case, or rings to book a second re-adjustment, has to be
told to find it on the website, and two of the three **Services** are not on the website at all.

The code had one Staff path that wrote an **Order**, `POST /api/shop/orders`. Nothing called it,
it took every price from the request body (ADR 0001 forbids exactly that), it created the Order
already sold with no money behind it, and no customer could pay it.

## Research: which Stripe instrument carries the link

Stripe offers three ways to send someone a link to pay. What decided it (Stripe docs, read
2026-11-07):

| | Checkout Session URL | Stripe Payment Link | Stripe Invoice | **Our link → new Checkout Session** |
|---|---|---|---|---|
| How long it works | 30 min – 24 h (`expires_at`) | Until deactivated | Until due date | **As long as we say (7 days), renewable** |
| PayNow | Yes (QR lasts 1 h) | Yes | Yes, `send_invoice` only | **Yes, fresh QR each open** |
| Price per order | `price_data` inline | Creates a Product + Price in the catalog per link | Invoice items | **`price_data` inline** |
| Settles through our webhook | Yes (`order_id` metadata) | Yes (link metadata is copied to its sessions) | No: new `invoice.paid` path | **Yes, the existing shop branch** |
| Our cancel / stock check before paying | Partly | No (it lives in Stripe) | No | **Yes, every open** |
| Two devices paying at once | — | `completed_sessions.limit` is not a lock | — | **One live session per Order, compare-and-set** |
| Branding of the link | checkout.stripe.com | buy.stripe.com | invoice.stripe.com + Stripe emails | **Our domain, our email; Stripe's page only to pay** |

So the link the customer gets is ours, and pressing **Pay** hands them to Stripe's hosted page,
where they pay by card, Apple Pay, Google Pay or PayNow. That is the "link to Stripe" the owner
asked for, without a second place the order's price lives.

## Solution

**Staff** — on a Customer's page, **Create order** (shown with `orders`):

1. Add products from a searchable list (price and stock shown), and Services (price from Costings).
   Quantities with steppers; nothing typed is a price.
2. Choose where it goes: *Hand over at a studio* (free), or *Deliver*, picking one of the
   customer's saved addresses or typing one, and a delivery method with its price.
3. Optionally a discount code, a note for the customer, an internal note.
4. The summary is priced by the server as they go: subtotal, shipping, discount, tax, total.
5. **Create order & email link** (or untick to only create). The dialog then shows the link with
   **Copy**, and a link to the Order.

On the Order page, a **Payment link** card for a Staff order: sent when and to whom, valid until,
**Copy link**, **Resend email** (renews 7 days). Cancelling the Order (existing button) closes the
link.

**Customer** — opens the email on their phone, sees the order and total on our page, presses
**Pay**, pays on Stripe, and lands back on our page: *Payment received*. The usual order
confirmation and receipt follow. A link for a paid, cancelled or expired order says so, with a way
to contact us.

**Developer** — a Staff order is a shop Order made by Staff. The new code is: pricing a draft from
the database, writing the pending Order with its lines, the link table, a page and one route that
opens Checkout, an email, and an expiry sweep. Settlement, the ledger, stock deduction, receipts,
labels, refunds, RMA and Analytics are reused as they are.

## User Stories

1. As **Staff**, I want to create an order from a Customer's page, so that I sell to the person I am talking to without retyping who they are.
2. As **Staff**, I want to add shop products with their stock in view, so that I do not sell what we do not have.
3. As **Staff**, I want to add a re-adjustment or a measurement service, so that a visit can be charged even though it is not in the shop.
4. As **Staff**, I want the prices to come from Costings and the shop, so that I never type an amount and cannot get one wrong.
5. As **Staff**, I want to apply a discount code the customer has, so that they get the same discount they would online.
6. As **Staff**, I want to choose between handing it over at the studio and delivering it, so that the shipping charge is right.
7. As **Staff**, I want to see the total before I create the order, so that I can tell the customer what they will pay.
8. As **Staff**, I want the payment link emailed to the customer when I create the order, so that they can pay on their own phone.
9. As **Staff**, I want to copy the link, so that I can send it by WhatsApp instead.
10. As **Staff**, I want to resend the link, so that a customer who lost the email or let it lapse can still pay.
11. As **Staff**, I want the order to appear under the customer straight away as awaiting payment, so that everyone can see it is owed.
12. As **Staff**, I want the order to confirm, take its stock out and get its label by itself when the customer pays, so that nothing is different from a shop order after that.
13. As a **Customer**, I want to see what I am paying for and the total before I pay, so that I trust the link.
14. As a **Customer**, I want to pay by card, Apple Pay, Google Pay or PayNow on my own phone, so that I do not have to pay at the counter.
15. As a **Customer**, I want to be told plainly when a link is already paid, cancelled or expired, so that I do not pay twice or wonder.
16. As an **Owner**, I want unpaid Staff orders to be cancelled when their link expires, so that the order list does not fill with orders nobody will pay.
17. As an **Owner**, I want every Staff order, send and cancel in the Audit Log, so that a disputed charge has a name against it.

## Non-goals

- **Customised pillows and bolsters on a Staff order.** They are **Results**; Staff use the Assist link or in-store customisation, then *Request payment*. A Staff order refuses them.
- **Typing a price, a custom line or a manual discount.** ADR 0001. A discount is a code made in Discounts.
- **Points or partner referral on a Staff order.** Points are spent by the customer at their own checkout (ADR 0030); Staff orders attribute to no partner.
- **Paying at the counter on a card reader.** PRD `in-store-counter-payments` (Stripe Terminal).
- **Cash or bank transfer.** An Order with no Stripe charge breaks the ledger's premise; worth doing separately.
- **Editing a Staff order after it is made.** Cancel and make a new one; the link points at a fixed total.
- **Deciding a complimentary re-adjustment.** That is the customer's own booking (ADR 0024); Staff add the fee only when one is owed.

## Constraints and risks

| Risk | Mitigation |
|---|---|
| Two devices open the link and both pay | One live Checkout per Order: an open one is reused; a new one is installed by compare-and-set on `orders.stripe_session_id`, and a loser expires its own session before returning. A payment that still lands twice is flagged by the existing *paid while closed* path. |
| Stock sold out between the email and the payment | Stock is re-checked before each Checkout opens; the page says what to do. |
| A Costings change after the link went out | The Order's total is fixed when made, like an authorised hold; 7 days bounds it. |
| A lapsed Checkout cancels the Order | The webhook's `expired` branch skips `purpose = staff_order`; only the link's own expiry cancels. |
| A token leaking | Uuid (122 bits), service-role-only table, sent only to the customer. The page shows the first name, lines, total and where it goes (so they can check the address before paying), never the email or phone. Rate-limited. |
| Stripe minimum | Totals under SGD 0.50 are refused when the order is made. |

## Success criteria

- Staff can create an order for a Customer with products and services, email the link, and the customer can pay it on a phone by card or PayNow.
- The paid Order is indistinguishable downstream from a shop Order: confirmed, ledger charge, stock deducted once, receipt sent, label made for a delivered order and not for a studio handover.
- No path charges a price that was not computed by the server from Costings and the shop.
- A lapsed Checkout leaves the link usable; an expired link cancels the Order within a day.
- `npm run ci` green; the graph committed.
