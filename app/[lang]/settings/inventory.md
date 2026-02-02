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
- Fillings defaults (can be edited later in Configure page):
  - XS: 3D (S) x1
  - S: 3D (S) x2
  - M: 3D (L) x1, 6D (S) x1
  - L: 3D (L) x1, 6D (L) x1
  - XL: 6D (L) x2, 6D+ (L) x1

Updated filling subtypes available:
- 3D (S)
- 6D (Round)
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

Notes:
- Buildable pillow counts are computed from parts on-hand via `product_buildable` view
- Low stock list shows items with on_hand <= 0; thresholds can be added via `item_thresholds`
