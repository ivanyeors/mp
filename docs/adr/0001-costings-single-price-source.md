# Costings is the single source of sell price; products are an inventory projection

We sell only what inventory can supply, and we price only from Costings. Free-form product creation and hand-typed storefront prices are retired.

**Storefront products** are projections of inventory: pillows/bolsters stay auto-generated from BOM templates; single-item products are published via "Add from inventory" when the item has an MSRP. Sellability is signalled by `item_prices.msrp` (no extra flag). For every auto-generated product, `price`, `cost_price`, and `compare_at_price` are mirrors written by `price-sync` from Costings and locked in the API/UI. Existing unmapped manual products are adopted when they match a sellable item, otherwise flagged as legacy.

## Considered options

- **Hand-priced manual products** — rejected: two write paths drift (the original money-flow leak).
- **Explicit `items.is_sellable` flag** — rejected: MSRP already means "we sell this"; a second flag would desync.
- **Hard-delete when MSRP is cleared** — rejected: loses images, Stripe linkage, and order history; archive + restore is enough.

## Consequences

- Operators set price only in Costings; the Products page never accepts a sell price for inventory-linked products.
- Clearing an item's MSRP archives its product on the next inventory sync; restoring MSRP returns it to draft.
- Shopify channel pricing remains a separate path (out of scope).
