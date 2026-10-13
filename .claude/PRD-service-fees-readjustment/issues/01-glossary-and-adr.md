# 01 — Glossary and ADR 0024: a service is a price without a part

**Type:** AFK
**Blocked by:** none
**User stories:** underpins all
**Labels:** `documentation`, `needs-triage`, `P1`

## Goal

Before a line of code exists, fix the words. This PRD exists because three things could each be modelled the wrong way, and each wrong way is cheap to type and expensive to undo:

- a priced act of labour modelled as an inventory **Item**
- a fee modelled as an **Add-on**
- a re-adjustment modelled as an anonymous calendar entry

## Scope

### `CONTEXT.md` — new terms

Add them next to **Costings** / **Add-on** and **Re-adjustment appointment**, in the house style (definition, then `_Avoid_`).

- **Service**
  - **Definition:** A priced act of labour Mpillow performs that consumes no inventory. There are exactly three:
    - Measurement (Premium)
    - Measurement (Basic)
    - Re-adjustment

    Priced in **Costings** (`service_prices`) and never an **Item**. Adding a fourth is a migration plus a rule in code, not a row an operator invents.
  - _Avoid:_ an **Item** with a "service" category; an **Add-on**; "product".
- **Service fee**
  - **Definition:** The amount charged for a **Service** on a **Result** or an **Order**. It is the **Service**'s MSRP in **Costings**, never typed by **Staff** and never taken from a client. On an **Order** it is its own line (`order_items.kind = 'service'`): never shipped, never stock-deducted, never returnable through RMA. It is outside the commission base and the free-shipping threshold, and inside the taxable base.
  - _Avoid:_ "fee" alone in money-ledger context, where `order_payments.type = 'fee'` is Stripe's dispute fee (a cost to us, not a charge to the customer); "surcharge".
- **Measurement service**
  - **Definition:** **Staff** measuring a customer for a customisation. Charged automatically when the **Result**'s `measured_by_type = 'staff'`, at the rate for its **Tier** (`assigned_tier ?? suggested_tier`):
    - Premium → Measurement (Premium)
    - Basic → Measurement (Basic)
    - **Mbolster** → Measurement (Basic)

    Self-measurement online is free. Derived on every repricing and never stored as its own flag.
  - _Avoid:_ a customer-ticked option in the configurator; treating the "Have us measure you" link as the charge (the link only books the visit; the charge follows who measured); "customisation charge".
- **Re-adjustment**
  - **Definition:** A post-purchase visit to re-tune one purchased pillow or bolster. It is booked as a **Re-adjustment appointment** by a signed-in **Customer** against one purchase, and recorded as a **Re-adjustment booking**.
  - _Avoid:_ an anonymous **Appointment** (the pre-PRD state); "readjust" in UI copy.
- **Complimentary re-adjustment**
  - **Definition:** A **Re-adjustment** charged nothing.
    - **Premium Mpillow only.**
    - `readjustment_free_visits` (default 1) per unit, within `readjustment_free_window_days` (default 60) of the purchase's `orders.paid_at`, counted in Singapore calendar days with the purchase date as day 0. The date tested is the booking date.
    - Used by a booking that is booked, attended or a no-show; given back by one that is cancelled or expired.
  - _Avoid:_ "warranty" (the 10-year fillings warranty is separate and still charges $30); computing it on the client.
- **Re-adjustment booking**
  - **Definition:** The `readjustment_bookings` row linking a **Customer**, one purchase (an `order_item`, or "not listed"), a slot, a **Location**, and either *complimentary* or a paid service **Order**. It is the record staff read at the visit.
  - _Avoid:_ conflating it with `appointment_reminders`, which is the WhatsApp reminder state keyed by calendar event and stays as it is.

### `CONTEXT.md` — edits

- **Costings:** add "…and **Service** prices (`service_prices`)".
- **Appointment:** amend *"appointments are not linked to Orders in v1"* to say that a **Re-adjustment appointment** is linked through its **Re-adjustment booking**, and a **Customisation appointment** still is not.
- **Relationships:** add *"A **Result** measured by **Staff** carries a **Measurement service** fee"* and *"A paid **Re-adjustment** is an **Order** with one **Service fee** line"*.

### `docs/adr/0024-services-priced-in-costings.md`

Record decisions (f), (g) and (h) from the PRD:

- services as non-inventory Costings rows;
- the measurement fee derived from `measured_by_type`;
- a paid re-adjustment as an **Order**.

Include the *Considered options* (Items, `site_settings`, `product_prices`, `addon_lines`, a stored flag, a non-Order payment), each with the code reason it was rejected (see the issue index).

### `docs/adr/0001-costings-single-price-source.md`

Add one line under *Consequences*: *"Amended by ADR 0024: Costings also prices **Services**, which are not **Items** and are never projected as storefront products."*

## Acceptance criteria

- [ ] The six terms are in `CONTEXT.md`, each with `_Avoid_` lines.
- [ ] **Costings**, **Appointment** and the Relationships list are amended.
- [ ] ADR 0024 exists with all six considered options and the code reason each was rejected.
- [ ] ADR 0001 carries the amendment line.
- [ ] The graph is refreshed in the same commit (CONTEXT.md and `docs/adr` are indexed).
