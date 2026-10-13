# Services are priced in Costings as non-inventory rows; a paid service is an Order line

Status: Accepted (PRD `service-fees-readjustment`, 2026-10-13)

Mpillow sells three **Services** — Measurement (Premium), Measurement (Basic) and Re-adjustment —
that consume no inventory. Before this record none of them existed on the platform; they lived
only as a retired Shopify product. Operators now set their prices in the **Admin Panel**, the
measurement fee is charged automatically when **Staff** measure a customer, and a re-adjustment is
booked by a signed-in **Customer** against one purchase and charged unless it is complimentary.

## Decisions

- **A service is a price without a part.** Service prices live in **Costings**, in their own
  table `service_prices` (closed key set: `measurement_premium`, `measurement_basic`,
  `readjustment`), edited at Costings → Service fees through the Costings save route under the
  `costings` permission. A service is never an **Item**, never a build line, never stock-checked.
  `lib/pricing/service-prices.ts` is the only reader. `msrp` is NOT NULL — a missing service price
  is a broken deploy, not a free service.
- **The measurement fee is derived from who measured.** It applies when the **Result**'s
  `measured_by_type = 'staff'`, at the rate for its **Tier**; **Mbolster** carries none. It is
  computed on every repricing by `lib/pricing/service-lines.ts` and enters every total through
  `resultChargeLines` beside add-ons and **Neck support**, so the surfaces that price a Result
  cannot disagree. No column on the Result stores it.
- **The fee is not goods.** `priceResult` reports `goods` and `services` separately. The shipping
  `free_above` threshold and the partner commission base see goods only; tax sees both.
- **Every dollar we take is an Order.** On accept, the measurement fee is its own `order_items` row
  (`kind = 'service'`, `service_key`), so lines still sum to the subtotal and every surface that
  reads lines can tell a service from a parcel. A paid re-adjustment is a pending **Order** with
  one service line, settled by the same `checkout.session.completed` branch every shop order uses,
  so the money ledger, receipts, refunds, disputes and Analytics need no new path.
- **Complimentary re-adjustment is a server-side rule.** Premium Mpillow only, one visit per unit
  within 60 days of `orders.paid_at` (both numbers in `site_settings`, edited beside the fees),
  claimed race-safely by a partial unique index on the booking table.
- **No Shopify.** Shopify is ad hoc and off the roadmap: no linking Shopify orders to Customers, no
  price sync to Shopify, no mapping of its retired services product. Purchases with no platform
  **Order** are booked as "not listed", at the fee, for **Staff** to verify.

## Considered options

- **Services as Items** — rejected. Every **Result** build line is stock-checked by
  `findStockShortages` at assign, finish, accept and reorder and deducted at accept; a fee Item
  with no stock would block every sale with a 409, appear in the on-hand stock KPIs and, as
  `accessories`, as an **Add-on** and a shop listing. Making it work needs a category plus six
  exemptions; ADR 0001 already rejected a flag on `items`.
- **Prices in `site_settings`** — rejected. Untyped public TEXT with no cost, currency or audit,
  and a second write surface for sell price beside Costings.
- **Rows in `product_prices`** — rejected. Relaxing its `kind` CHECK blurs "finished-good MSRP of a
  **Composed sellable**"; a sibling table is one migration.
- **The fee as an `addon_lines` entry** — rejected. The configurator keeps only `accessories`
  add-ons (a Staff reconfigure would drop it), add-on lines are stock-checked, and reorder copies
  them.
- **A stored "fee applies" flag on the Result** — rejected. `measured_by_type` already records the
  fact; a second column could disagree with it.
- **A re-adjustment payment recorded on the booking, not as an Order** — rejected. Analytics, the
  ledger, refunds, disputes and receipts all key on `orders`.

## Consequences

- ADR 0001 is amended: Costings also prices **Services**.
- The hold route must preserve a Draft's `measured_by_*` (it used to reset them to `by_user`,
  which would now silently drop the fee).
- `order_items` gains `kind` (`goods` | `service`) and `service_key`; shipping, RMA eligibility,
  commission and Analytics skip or label service lines.
- A **Re-adjustment appointment** is now linked to a **Customer** and a purchase through
  `readjustment_bookings`; a **Customisation appointment** is unchanged.
- A paid re-adjustment's calendar event is created only after payment; the slot is held in our
  database for the 30 minutes the Checkout Session lives, so no Google invite is sent for an
  abandoned checkout.
