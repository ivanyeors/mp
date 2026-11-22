# Slice 06 — Inventory, Costings, Discounts

Type: AFK
Parent: PRD `permissions-view-edit`
Triage: blocked by 04
Status: todo
User stories covered: 6, 7
Owner review: **money**. `app/*/settings/costings/**`, `app/*/settings/discounts/**`, `app/api/shop/coupons/**` and `app/api/settings/discounts/**` are money paths, so it needs the `reviewer` subagent.

## What to build

Apply the page-slice rule (`issues/README.md`) to:

| Page | Writes move to | Notes |
|---|---|---|
| Inventory | `inventory-edit` | `inventory/actions.ts`: 15 `assertAdmin('inventory')` writes; the 5 shared Shopify mapping actions take `assertAnyAdmin(['inventory-edit','shopify-link'])`. Read actions stay on `inventory`. `/api/mp-config/assist` POST (saves a filling template) → `inventory-edit`. |
| Costings + Service fees | `costings-edit` | `/settings/costings/save`, `services` writes. `/api/settings/service-fees` GET stays `requireAnyAdmin(["costings","appointments"])`; its writes → `costings-edit`. |
| Discounts | `discounts-edit` | `/api/shop/coupons*`, `discounts/actions.ts`, `/api/settings/discounts/points` PUT, past-purchases POST |

- Inventory and Costings read some tables from the browser. Those are SELECT-only policies, so no database change is needed.
- After this slice, slice 10's cost writes move from `costings` to `costings-edit`.

## Acceptance criteria

- [ ] `page-write-guard.test.ts` gains these folders, shown failing before and passing after. Server actions are included: `inventory/actions.ts` is a `"use server"` file.
- [ ] Route-gate tests: Costings View-only gets 403 on `/settings/costings/save`; Discounts View-only gets 403 on a coupon POST.
- [ ] Read-only render: Costings with `canEdit={false}` has no Save, and its price inputs are disabled.
- [ ] Preview screenshots as a View-only role.
- [ ] `reviewer` subagent verdict recorded.

## Blocked by

- Slice 04.
