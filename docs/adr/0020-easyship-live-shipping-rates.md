# Shipping is priced live through Easyship, re-priced on the server, and labelled from the order

A **Shipping method** can now charge a **Live rate**: Easyship's courier price for the cart's
**Parcels** to the shopper's postal code, marked up and rounded by the method. Flat methods are
unchanged. Staff buy the label for any order from Settings → Orders, and Easyship's webhooks mark
it shipped and delivered.

## Context

Shipping was a flat `base_rate` per method and country, typed by Staff. Pillows are light but
bulky, so couriers bill them by volume, and the real cost to a postcode in Singapore and one in
Jakarta differ several times over. A flat rate either overcharged nearby shoppers or lost money on
far ones. Fulfilment was a tracking number typed into "Mark as Shipped", and `delivered_at` — which
anchors the RMA **Return window** and commission release — was set by hand or not at all.

Easyship was chosen (research, 2026-09-29) for its self-serve API, Singapore origin, coverage of
Southeast Asian couriers in one integration, and landed-cost quotes for cross-border parcels.

## Decision

- **A method's rate source, not a new kind of method.** `shipping_methods.rate_source` is `flat` or
  `easyship`. A live method picks one courier from the rates by `easyship_strategy` (`cheapest`,
  `fastest`, `best_value`, or a pinned `courier`), applies `markup_percent`, then `markup_fixed`,
  then rounds up to `rate_rounding`. `free_above` and free-shipping coupons apply to both sources.
  `base_rate` stays, as the **Fallback rate**.
- **The server prices; the client never sends a price.** `POST /api/shop/shipping/quote` takes
  variant ids and quantities, builds **Parcels** from the database (`buildParcels`, pure), and asks
  Easyship once for all live methods. The checkout route does the same from its own cart. Both hash
  the same parcels, destination and origin to the same `cache_key` in `shipping_rate_quotes`, so
  within the quote TTL the route reads the exact rates the page showed. After the TTL it re-prices;
  Stripe's page shows the final figure either way.
- **Fail open on outages, closed on coverage.** _Superseded by ADR 0022: a live method with no quote is hidden, never priced at its fallback._ No token, live rates switched off, Easyship down, an
  unreadable settings row, or rates in the wrong currency: the method charges its **Fallback rate**
  and the sale goes through. Easyship answering with no courier the method allows: the method is
  hidden for that address, because a fallback price for a parcel nobody will carry is a refund later.
- **Parcels are boxed by product type.** Every pillow, bolster or bundle unit is its own box from its
  **Package profile**; accessories ride in the first box. A variant's `weight_grams` wins over the
  profile weight. More than 20 boxes is not a checkout quote — it falls back.
- **Secrets are environment, settings are rows.** `EASYSHIP_API_TOKEN` (a `sand_` token selects the
  sandbox host) and `EASYSHIP_WEBHOOK_SECRET` are environment variables. The ship-from address,
  package profiles, incoterms, HS code, handling days and quote TTL are one `shipping_settings` row,
  server-only, edited in Settings → Shipping → Easyship.
- **What a courier costs us is not on `orders`.** Customers read their own orders with `select *`,
  so the courier service, its quoted cost, the label and its cost live in `order_shipments`
  (server-only, one row per order). `orders` gains only `shipping_courier` and
  `shipping_tracking_status`, which the customer sees on their order page.
- **One label per order, bought by Staff.** "Ship with Easyship" fetches today's rates for the
  order's parcels with the shopper's courier preselected. The purchase claims the order
  (`order_shipments.easyship_shipment_id = 'pending:<uuid>'` under a guarded update) before calling
  Easyship and releases the claim if Easyship refuses, so a double click cannot buy two labels.
- **Shipped and delivered come from the courier.** `markOrderShipped` is now the one path for both
  manual fulfilment and Easyship: tracking, timeline, the (idempotent) shipping email. It runs the
  first time a tracking number exists — at purchase, or from `shipment.label.created`. A
  `shipment.tracking.status.changed` of "Delivered" sets `delivered_at` once, and never moves it.
  The webhook verifies Easyship's HS256 JWT signature and accepts nothing without
  `EASYSHIP_WEBHOOK_SECRET`.

## Consequences

- **Results keep flat shipping.** _Superseded by ADR 0032: a Result quotes a live method once and keeps the rate._ A customisation session's **Authorization hold** is taken days
  before the build ships, and its total is recomputed at hold, assign, finish and accept. Those paths
  price an Easyship method at its **Fallback rate**, so the hold is a stable number. Their orders are
  still labelled through Easyship. Live-pricing the finish would need the quote persisted on the
  Result; that is a separate slice.
- **The margin view does not subtract courier cost yet.** `order_margins` still treats
  `shipping_amount` as revenue. The cost is recorded (`order_shipments.carrier_cost`, or
  `quoted_carrier_cost` before a label) for when it does.
- **Easyship's field names are read tolerantly.** Rates are read in the 2024-09 shape
  (`courier_service.id`) and the 2023-01 one (`courier_id`); labels as a hosted URL or base64 pages.
  `EASYSHIP_API_VERSION` pins the version. Verify a label purchase in the sandbox before switching
  the production token on.
- **Every address sent to Easyship has a city.** Easyship refuses a blank one, and most quotes are
  made from a country and postal code alone. Those send the country's main city ("Singapore",
  "Kuala Lumpur"); the shopper's own city wins once there is one. Rates are zoned by postal code,
  which is also why the quote cache key leaves the city out.
- **A method's countries are now enforced at checkout.** The route used to accept any method for any
  address; it now refuses a method whose `countries` do not include the address's country.
