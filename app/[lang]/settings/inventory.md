# Inventory setup

Environment variables required:

- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY (server only)

Scripts:
- npm run db:push — push SQL to Supabase (if using local linked project)
- npm run db:gen-types — generate TypeScript types from DB

Default BOM rules:
- Packaging mapping: XS/S/M → S; L/XL → L (1 vacuum_bag + 1 laundry_net)
- Core components per size: cover x1, case x1, protector x1 (matching size)
- Fillings are not BOM lines. They live only in Filling Templates, chosen per
  size in Configure (ADR 0003).

Updated filling subtypes available:
- 3D (S)
- 6D (Corner)
- 6D+ (Folded)
- 6D (S)
- 6D+ (S)
- 6D (M)
- 6D (L)
- 6D+ (L)
- 6D (XL)

Usage:
- Configure BOM at /settings/inventory/configure
- Inventory operations at /settings/inventory
  - Sell pillow: deducts all BOM parts including packaging
  - Sell part: deducts that single item
  - Receive stock: increases on-hand for that item

How stock is recorded, added, sold and shown: `docs/data-flows/inventory.md` and
`docs/data-flows/purchases-to-inventory.md`.
