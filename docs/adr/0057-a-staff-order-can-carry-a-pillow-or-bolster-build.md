# A Staff order can carry a pillow or bolster, built with the fillings Staff choose

Status: Accepted (owner, 2026-11-23).

Amends ADR 0048 (*Which goods*: "except a pillow or bolster") and PRD
`staff-orders-payment-links` (non-goal *Customised pillows and bolsters on a Staff order*).

## Context

A **Staff order** took any Variant but a pillow or a bolster (ADR 0048): those are customised
builds, and a customised build was a **Result**, with measurements, an assignment and *Request
payment*. At the counter that is the wrong amount of work for a common sale. A customer who is
already fitted wants a second Mpillow, or an Mbolster with the visit; Staff know the size and the
mix, and there is nothing to measure. The Create order dialog offered accessories only.

The owner asked for it (2026-11-23): on a Customer's page or from Orders, also add Mpillow Basic,
Mpillow Premium and Mbolster, and when adding one, choose its **Filling Template** and adjust it
before the order is made.

## Decision

**A Staff order may hold pillow and bolster Variants. Each one is added with a Filling
configuration: Staff pick a Filling Template for that size or length and change it in the X-ray
editor before the order exists. It is a goods line on the Variant, priced from Costings, that
carries the build.**

- **The line is the shop's customised line, plus where each filling goes.** `variant_id` is the
  pillow or bolster Variant; `customization_id` points at a `customization_configs` row; the
  line's snapshot (`StaffBuildSnapshot`, `source: "staff_order"`) holds the flat `filling_lines`
  the stock code reads and the spatial `filling_placements` the workshop builds from. So the
  Order is counted, costed, deducted, restocked and shown in the CRM by the code that already
  handles a customised shop line (`stockLinesForOrderItem`, `customer_purchase_lines`). There is
  no `result_id`: no measurements were taken, and nothing in Results is made for it.
- **Price: Costings, never the mix (ADR 0001).** The unit price is the Composed sellable's shelf
  MSRP (`loadComposedSellable`): the size × tier row for the recipe's default case, or the
  length's row. Fillings and a placed Neck support do not move it. Each **Ear Comfort Pad**
  placed inside is charged at its own MSRP on top (`placedChargeLines`), exactly as on a Result
  (owner, 2026-11-05): it is not in the pillow's MSRP. A build Costings cannot price, or one
  holding an ear pad with no MSRP, is refused. The dialog lists the Variant's mirrored price; the
  quote is what is charged.
- **Cover and case are the recipe's.** Staff choose fillings only. A different case is sold as
  its own line.
- **What may go in.** Placements are validated as a Result's are: filling Items in the nine
  cells (a bolster's one compartment), and a neck support or ear pad in a Premium pillow only.
  A Basic pillow and a bolster are offered only templates and Items they can take. A Filling
  Template must serve the size; one with no layout is not offered for a pillow, and a bolster's
  flat recipe is laid out one piece per unit.
- **Template or adjusted.** The snapshot keeps `filling_template_id` and its name only while the
  placements still match the template exactly (the rule a Result follows); otherwise it records
  the template it started from (`based_on_template`) and reads *Adjusted from …*. Staff never
  create or change a catalog Filling Template from here.
- **Stock.** The build (the recipe's non-filling Items and the chosen fillings, times the
  quantity, across every build in the order, after what the order's own accessory lines take of
  the same Items) is checked against `inventory_balances` when the order is priced and again
  each time the customer opens Checkout. It leaves stock when the
  order is paid, by link or marked paid, through the same claim as any Staff order.
- **A pillow or bolster added without fillings is still refused**, by the server, with a message
  that says to choose them.
- **Permission: `orders`**, as for the rest of a Staff order. The templates and Items for a
  Variant come from `GET /api/staff-orders/build-options`, so selling needs neither `results`
  nor `configure`.

## Considered options

- **Make a Result for each pillow** — rejected. A Result is a submission with answers, an
  assignment and a hold or Balance payment. A second pillow for a fitted customer has none of
  them, and a Result per line would bring its statuses, emails and SLA with it.
- **A Result-shaped line with no Variant** — rejected. Every reader of that shape keys on
  `result_id` (the Order page's link, restock, analytics); a made-up id would be a lie, and no id
  would need each of them changed.
- **Flat filling lines only, as the shop's cart customiser stores** — rejected. The workshop needs
  where each piece goes, and the customer's pillow drawing reads the placements.
- **Let Staff type the price for an unusual mix** — rejected. ADR 0001.

## Consequences

- `StaffOrderDraftSchema` gains `builds`; `quoteStaffOrder` prices them (`lib/staff-orders/builds.ts`)
  and `createStaffOrder` writes their `customization_configs` rows, removing them if the Order
  cannot be written.
- The Create order dialog lists pillows and bolsters first, opens a fillings editor for one, and
  shows each line's fillings with *Change fillings*. Prices in the product list are larger and
  sit on the right; *Add* shows on hover or focus.
- The Order page's *Build snapshot* card shows a Staff build's template and placement breakdown.
  The customer's pillow drawing (`lib/customer-pillow`) reads a paid Staff build's placements.
- `createMpConfigFromCustomization` skips a Staff build, so a link payment and a marked-paid
  order leave the same records.
- `docs/data-flows/purchases-to-inventory.md` and the Staff orders guide say the same.
