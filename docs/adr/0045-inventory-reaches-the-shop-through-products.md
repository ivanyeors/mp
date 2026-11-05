# An Item reaches the shop through Products: costed, pushed with a price check, then listed

Status: Accepted (2026-11-05). Amends the **Listed** switch added in `b466660`, which listed Inventory
families directly.

A cover, case, protector or accessory added in Inventory had two ways to go wrong on its way to
the shop. Settings → Products → In the shop listed every such Item straight from Inventory, so a
product appeared in the shop without ever being on the Products page, and the only price gate was
"has an MSRP": nobody saw its cost or margin before it went on sale. And nothing in Inventory said
that a new Item still needed a cost in Costings.

## Decision

The path is **Inventory → Costings → Products → In the shop**, one step per page.

- **Costings first.** An Item is in step with Costings when it has a cost, and, if the shop can
  sell it (`SHOP_LISTABLE_ITEM_CATEGORIES`), an MSRP. Until then the Inventory page shows an amber
  "Add cost" button on its family that opens Costings on just those Items
  (`/settings/costings?items=…`). Once Costings holds the prices the button is gone.
- **Push to Products, with a price check.** A family Costings has finished gets a Push button in
  Inventory, and is listed under Products → Add from Inventory. The push dialog shows each size's
  cost, MSRP and margin, flags a size sold at or below cost, and waits until Staff tick "I've
  checked these prices". The request carries the prices Staff saw, and
  `POST /api/shop/products/from-inventory` refuses the push when Costings no longer holds exactly
  those prices (`checkPushPrices`), so no price goes out that nobody looked at. A family with no
  product gets a **draft** Storefront product. A family whose product lacks a size added since
  gets that size as a new Variant of the same product, never a second product.
- **In the shop lists products.** The In the shop tab lists the Storefront products on the
  Products tab that the shop sells (not pillows and bolsters, which the configurator sells, and
  not archived ones). Its switch writes the product: `status` active, or back to draft. Listing
  re-reads prices from Costings and refuses a product with an unpriced Variant. Nothing reaches
  the shop that is not on the Products page.

**Listed** keeps its meaning (CONTEXT.md): `products.status = 'active'` with an active Variant.
Only where it is switched changed.

## Consequences

- A newly added Item is never sold by accident: it needs Costings, a push and a switch.
- Costings stays the single price source (ADR 0001). The push copies nothing: Variant prices are
  resolved from Costings through `price_key`, and every later Costings save updates them.
- Products made by the old per-family switch are unchanged. A family it took out of the shop has
  every Variant switched off; listing such a product switches them back on.
- A one-size product cannot take a sized Item, or the reverse. The push refuses and asks for the
  Item to be named apart in Inventory rather than guessing.
- Push and listing need the `products` permission. Inventory-only Staff see the button and get a
  refusal; reading the Costings state in Inventory needs `inventory`.
