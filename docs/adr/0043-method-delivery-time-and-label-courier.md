# A method's own delivery time is what shoppers see, and every label opens on the customer's courier

Status: Accepted (2026-11-03)

Shoppers choose how their order ships by picking a **Shipping method** (Standard, Express…).
Each live method resolves to one courier by its strategy (ADR 0020), and its price is that
courier's rate with our markup, so picking another method changes the price and the total.
This record settles two things that choice left loose: what a shopper is told about how long a
method takes, and which courier the label is bought with.

## Context

- Standard shipping goes by J&T and takes about two weeks, and shoppers must be told so. A live
  method showed only the courier's transit window, which knows nothing of how the store ships. A
  method's typed "Estimated days" was shown only when the courier gave no window, and the
  configurators never showed it.
- An **Order** from shop checkout records the courier the shopper paid for in its **Order
  shipment**, and the label dialog opens on it. An Order made from a **Result** records none (ADR
  0032 stores the rate, not the courier), so its dialog opened on the cheapest courier, even for
  a customer who chose Express. A paid-for courier missing from today's rates was also swapped
  for the cheapest without a word.

## Decision

- **Staff's delivery time wins.** A method's `estimated_days` (the form's **Delivery time**,
  per language, English when the shopper's language has none) is shown instead of the courier's
  transit window on checkout, the configurators and the delivery checker. Empty, a live method
  shows the courier's window, as before. It needs no address, so it shows before a rate is in.
  One rule, `shownDeliveryTime` in `lib/shipping/delivery-time.ts`.
- **The configurators name the courier**, "via J&T Express", as checkout and the delivery
  checker already did.
- **Every label opens on the customer's courier.** The dialog preselects the courier the customer
  paid for at checkout; else the courier their method's strategy picks from today's rates (the
  method is the order's `shipping_method_id`, or its Result's `shipping_method`, the anchor's for
  a Paired build); else the cheapest. When the paid-for courier is not in today's rates, the
  dialog says so. `preselectCourier` in `lib/shipping/order-shipment.ts`.
- **Pinning a courier is picked by name.** "A specific courier" lists today's couriers for one
  pillow to the method's first country, from the Couriers test quote; the id field remains.

## Consequences

- A method that still has old "Estimated days" text (the seeded `standard` and `express` carry
  "5-7 days" and "1-3 days") now shows that text instead of the courier's window. Check each
  live method's Delivery time after this ships, and clear the ones that should follow the courier.
- Labels were still bought by Staff, one order at a time. Superseded by ADR 0044: the label is
  made at payment, on the same courier this record preselects, and the order ships at the
  courier's first scan.
- The shipping email still states the courier's transit window from the label, after the parcel
  has left.
