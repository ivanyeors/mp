# Slice 05 — Store: Products, Categories, Configure, Rules Engine, Shipping, Couriers

Type: AFK
Parent: PRD `permissions-view-edit`
Triage: blocked by 04
Status: todo
User stories covered: 6, 7
Owner review: **money**. `app/api/shop/products/*/variants/**` and `resync-prices` are money paths, so it needs the `reviewer` subagent.

## What to build

Apply the page-slice rule (`issues/README.md`) to:

| Page | Writes move to | Notes |
|---|---|---|
| Products | `products-edit` | `/api/shop/products*` writes, `products/actions.ts`, listings PATCH, `sync-inventory` (`requireAnyAdmin(["products-edit","inventory-edit"])`), `from-inventory` POST |
| Products › Categories | `categories` (decision 4) | Already on `categories`; the tab shows read-only without it |
| Configure | `configure-edit` | `inventory/configure/{save,templates,unpromoted}` routes, `product-builder/{mappings,dimensions,soft-body,filling-visuals}` routes |
| Rules Engine | `rules-engine-edit` | `/api/settings/rules-engine/*` writes |
| Shipping | `shipping-edit` | `/api/shop/shipping*` writes, settings PUT |
| Shipping › Couriers | `shipping-couriers-edit` | `/api/settings/easyship` POST/PUT. Couriers hidden without `shipping-couriers`. The `easyship` skill's settings API calls keep working for the owner (`grants_all`). |

Variant cost on Products is slice 10, not this one.

## Acceptance criteria

- [ ] `page-write-guard.test.ts` gains these folders, shown failing before the move and passing after.
- [ ] Route-gate test per page, including Couriers: Shipping Edit without Couriers Edit gets 403 on `/api/settings/easyship` PUT.
- [ ] Read-only render tests for the Products list, the product editor and the Shipping methods.
- [ ] Preview screenshots as a View-only role.
- [ ] `reviewer` subagent verdict recorded in the pull request.

## Blocked by

- Slice 04.
