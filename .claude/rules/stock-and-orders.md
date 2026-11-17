---
paths:
  - "lib/inventory/**"
  - "lib/ecommerce/**"
  - "lib/shipping/**"
  - "lib/easyship/**"
  - "lib/readjustment/**"
  - "app/api/shop/orders/**"
  - "app/api/shop/stock/**"
  - "app/api/shipping/**"
  - "app/*/settings/inventory/**"
  - "app/*/settings/orders/**"
---

# Stock and orders

- Read `docs/data-flows/inventory.md` and
  `docs/data-flows/purchases-to-inventory.md` first: they say how stock is
  recorded, added and sold through each purchase channel, and which Admin
  Panel pages change which tables.
- Before changing a table or the meaning of a column, check every writer in
  `graphify-out/DATA_LAYER.md` ("Written by"), then confirm in the source,
  since the graph can lag the code.
