# Data flows

How data moves through mp, written for people and agents changing it.

| Doc | Covers |
|---|---|
| [inventory.md](inventory.md) | The stock ledger, on-hand and buildable views, every way stock is added, and how stock reaches the shop, the configurator and Shopify |
| [purchases-to-inventory.md](purchases-to-inventory.md) | Every purchase channel that takes stock out (shop, Results, Shopify, in-store) and how each avoids deducting twice |
| [settings.md](settings.md) | Which Admin Panel pages change which tables, and how a Costings price reaches Variants, Stripe and Shopify |

These docs explain *why* and *when*. For *who reads or writes a table*, use the
generated data layer, which is rebuilt from the code on every
`./scripts/graphify update` and cannot go stale:

```bash
./scripts/graphify explain "inventory_transactions"          # every writer and reader, with lines
./scripts/graphify explain "/settings/costings"               # a page's actions, endpoints and tables
./scripts/graphify path "/shop/checkout" "inventory_transactions"
grep -A30 '^### product_variants$' graphify-out/DATA_LAYER.md
```

When you change a flow described here, update the doc in the same pull
request. A "Known gaps" entry that you fix should be deleted, not left behind.
