# Money Pillow (mp)

Inventory-backed catalog and storefront for custom pillows, bolsters, and accessories. Costings is the single source of sell price; storefront products are a projection of inventory.

## Language

**Item**:
An atomic inventory part (cover, filling, case, packaging, accessory, etc.) with optional cost and MSRP in Costings.
_Avoid_: SKU (ambiguous with storefront variant SKU), part (when you mean the sellable finished good)

**Sellable item**:
An **Item** with an MSRP set in Costings (`item_prices.msrp` not null). Eligible to be published as a single-item storefront product.
_Avoid_: accessory (category only — sellability is signalled by MSRP, not category)

**Composed sellable**:
A pillow (`pillow_products`, size × kind) or bolster (`bolster_bom_lines`, short/medium/long) built from a BOM of **Items**. Finished-good MSRP lives in `product_prices`.
_Avoid_: product (when you mean the inventory BOM template, not the storefront listing)

**Storefront product**:
A shop listing (`products` + `product_variants`). A projection of inventory: auto-generated from pillows/bolsters or published from a **Sellable item**. When `is_auto_generated`, price/cost/compare-at are Costings-derived and locked.
_Avoid_: listing, SKU (use **Variant** for the priced unit)

**Variant**:
A priced, stocked unit of a **Storefront product**, linked to inventory via `item_id`, `pillow_product_id`, and/or `price_key`.
_Avoid_: option (UI option values are not the variant itself)

**Costings**:
The single write surface for item and product prices: cost, MSRP, and compare-at (`item_prices`, `product_prices`).
_Avoid_: pricing page, product editor (those only display mirrors)

**MSRP**:
The authoritative sell price set in **Costings**. Mirrored to `product_variants.price` and Stripe.
_Avoid_: price (when you mean the editable source — use MSRP), list price

**Legacy product**:
A **Storefront product** that is not inventory-linked (`is_auto_generated = false` and no costing link on variants). Hand-editable; should be adopted or retired.

## Relationships

- An **Item** may be a **Sellable item** when it has an MSRP
- A **Composed sellable** is made of one or more **Items** (BOM)
- A **Storefront product** projects either a **Composed sellable** or a **Sellable item**
- A **Storefront product** has one or more **Variants**
- **Costings** owns MSRP, cost, and compare-at for every non-legacy **Variant**

## Example dialogue

> **Dev:** "Can I type a price on the product editor for an accessory?"
> **Domain expert:** "No — publish a **Sellable item** from inventory. Its **MSRP** in **Costings** is the price customers see."
>
> **Dev:** "What if we clear the MSRP on that item?"
> **Domain expert:** "The **Storefront product** is archived on the next sync. Restore the MSRP and it comes back as a draft — we never delete it."

## Flagged ambiguities

- "product" was used for both inventory BOM templates (`pillow_products`) and storefront listings (`products`) — resolved: **Composed sellable** vs **Storefront product**.
- "price" was used for both the editable Costings field and the storefront mirror — resolved: **MSRP** is the source; `product_variants.price` is the mirror.
