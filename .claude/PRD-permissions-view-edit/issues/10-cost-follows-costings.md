# Slice 10 — Cost price follows Costings everywhere

Type: AFK
Parent: PRD `permissions-view-edit`
Triage: ready (owner, 2026-11-22: "Costings box" controls cost price everywhere). Reads can start now; writes move to `costings-edit` after slice 06.
Status: todo
User stories covered: 9
Owner review: **money**. Costings, product variant prices and margin, so it needs the `reviewer` subagent.

## What to build

Every server path that sends cost price, cost-based margin or COGS to an Admin Panel page sends it only to a Member with `costings`. Anyone else gets `null`, and the page renders nothing in its place. Writes that set cost refuse without `costings`, and without `costings-edit` once slice 06 has landed.

| Where | Today | Change |
|---|---|---|
| Inventory: `getInventoryCostingState` (`inventory/actions.ts:418-422`) and the item editor's cost writes (`:569`, `:596`) | `inventory` | Read: `costCents: null` without `costings`. Write: ignore or refuse `costPrice` without `costings`. **A separate pull request is already in flight for this, following PR #459.** |
| Products: variant cost (`products-client.tsx:139`, `[id]/product-editor-client.tsx:1241`; `/api/shop/products/[id]/variants*`) | `products` (Marketing holds it on live data) | The server omits `cost_price` without `costings`; the variant cost input is hidden; the variant routes refuse `cost_price` without `costings`. |
| Push to Products dialog (`components/settings/push-to-products-dialog.tsx:74,92`) | `inventory` + `products` | The margin warning needs cost, so it shows only with `costings`; `cost_cents` comes from the server, not the client. |
| Analytics › Sales & margin (`SalesTab.tsx`, `MarginBreakdownVisx.tsx`) | `analytics` | Margin and COGS series omitted without `costings` (decision 7). |
| Any other `cost_price` / `unit_cost` / `total_cost` reaching a page | — | Found by `grep -rn "cost_price\|unit_cost\|total_cost\|costCents"` over `app/` and `lib/`, and listed here as it is worked |

The browser read of `item_prices` is already Costings-only in the database (`admin_has_permission('costings')`, PR #459).

## Acceptance criteria

- [ ] Each path in the table has a test: a context without `costings` gets `null` cost and margin, and with it gets the value.
- [ ] The tests are shown failing on the old code.
- [ ] Variant routes: a PATCH with `cost_price` from a role without `costings` is refused (403), or the field is dropped. Pick one, test it, and say which.
- [ ] Preview screenshots of Inventory, the product editor and Analytics › Sales & margin as a role without `costings`: no cost or margin anywhere, and no "$0".
- [ ] `reviewer` subagent verdict recorded.

## Blocked by

- None for the reads. Slice 06 for moving cost writes to `costings-edit`.
