# Customisations price shipping live, and the Result keeps the rate it was quoted

Status: Accepted (2026-10-23)

Supersedes the Results consequences of ADR 0020, ADR 0022 and ADR 0031. Those said
customisation orders charge a method's `base_rate` and never quote couriers. The storefront has
quoted couriers since ADR 0020. The customisation flows (Mpillow, Mbolster, a Paired build, the
customer's finish of an Assisted customisation, and the Staff re-configure) now quote them too.
They also let the customer choose the country.

## Context

The configurator offered one country, Singapore, and charged each method's `base_rate`. That held
while every customisation shipped locally. A live method carried a **Customisation order rate**
for Results, a flat price for every country it lists: one figure for Singapore and Brazil, the
problem live rates were introduced to fix (ADR 0031). And a customer abroad could not order at
all. ADR 0020 had already named the fix: a Result's shipping is re-priced at hold, assign, finish
and accept, days apart, so a live price needs to be stored on the Result.

## Decision

- **Quote once, when the shipping is chosen, and keep it.** `mp_config_responses.shipping_rate`
  holds a live method's marked-up, rounded price for the Result's address, before `free_above`.
  It is written by the hold, the finish, and a re-configure that changes the method or postal
  code. Every repricing (assign, the Result page, finish, request-payment, accept, reorder)
  charges it through `resultShippingAmount`. `free_above` is still applied to goods at each one.
  Null means the method's `base_rate`, as before: a flat method, Self-collect, a companion, or a
  Result held before the column existed.
- **The same boxes on the page and in the hold.** A customisation is quoted without a cart, as
  one unit of each product type declared at the estimate value (`estimateLines`). The
  configurator asks `POST /api/shop/shipping/quote` with `profile: ["pillow"]`, `["bolster"]`,
  or, at a Paired build's step 2, `["pillow", "bolster"]`. The hold builds the same lines, so
  within the quote TTL it reads the cached rate the customer was shown. After the TTL it quotes
  again, and Stripe's page shows the final figure.
- **A Paired build is one shipment.** The anchor's rate is quoted for both boxes. The companion
  stores no rate and charges no shipping (ADR 0026). Step 1 shows the Mpillow alone. Step 2
  quotes again with the Mbolster in the box and shows the combined shipping before the hold.
- **No courier, no hold.** A live method with no quote for the address is refused (400), never
  charged its `base_rate` (ADR 0022). The page disables it and moves the selection to a method
  that can ship.
- **One price.** Each method shows a single figure: the courier rate with our markup and rounding,
  as `priceLiveRate` makes it, with its delivery window. Once the address has a rate, the
  preview footer adds a Shipping row and folds it into the total ("Total (before tax)").
- **Where it ships is chosen on the page.** The configurator's shipping section opens with a
  **Delivery country** picker (ADR 0031) and lists that country's methods. The postal code is
  optional where the country has none. A State / Province field is offered where Easyship
  needs one (`needsState`). The "show every method" fallback for methods with no country tag
  now applies to Singapore only.

- **No Customisation order rate.** The method form hides `base_rate` for a live method again
  and no longer requires it above 0. The stored value is kept: it is what a Result held before
  this change still charges.

## Consequences

- **Apply the migration before the code.** Every hold and repricing selects or writes
  `shipping_rate`, so against the old schema they fail. The column on its own changes nothing.
- A re-configure that keeps the method and postal code keeps the stored rate, so a filling change
  does not move the customer's shipping. Changing either quotes again.
- A reorder copies the stored rate rather than quoting couriers again: without it the clone would
  fall back to a live method's `base_rate` of 0. Goods are still priced at today's Costings.
- Add-ons are not boxed into a customisation's quote. They ride in the build's box, and the label
  is bought from the order's real lines (ADR 0020).
- The hold does not yet refuse a method whose `countries` leave out the address's country, as
  checkout does. The configurator only lists methods for the chosen country.
