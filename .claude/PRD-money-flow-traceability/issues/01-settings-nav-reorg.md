# Slice 01 — Settings sidebar reorg + Shopify/Integration split + Categories merge

Type: AFK
Parent: PRD `money-flow-traceability` (`.claude/PRD/money-flow-traceability-prd.md`)
User stories covered: 40, 41, 42, 43

## What to build

Reorganize the settings sidebar to match the operational workflow and separate interim Shopify tooling from core backend, end to end (nav config + routes + redirects + the Categories merge).

Target section order and entries:
- Settings (unchanged): General -> API Configs, Admin Users, Staff Management
- Inventory (directly below Settings, flat): Inventory, Costings, Configure
- Store (flat): Products, Customers, Results, Orders, Discounts, Shipping
- Landing Site (above Insights): Page Builder, Blogs, Media
- Insights: Analytics, Audit Log
- Integration (new, last): Shopify Admin

Move the Shopify Admin route to `/settings/integrations/shopify` (redirect from the old `/settings/inventory/shopify`), reusing the existing `inventory` permission. Merge Categories management into the Products page and redirect `/settings/categories` -> `/settings/products`. Surface result->customer and order->result tags where the relationships already exist (add an FK only if missing; otherwise flag as follow-up).

## Acceptance criteria

- [ ] Sidebar renders sections in order: Settings, Inventory, Store, Landing Site, Insights, Integration.
- [ ] Inventory section shows flat entries Inventory, Costings, Configure (Configure no longer nested).
- [ ] Store section shows flat entries Products, Customers, Results, Orders, Discounts, Shipping (Results/Customers no longer nested under Orders).
- [ ] Shopify Admin appears only under Integration; visiting `/settings/inventory/shopify` redirects to `/settings/integrations/shopify`.
- [ ] Shopify Admin entry respects the existing `inventory` permission.
- [ ] Category create/edit/delete works inside the Products page; `/settings/categories` redirects to `/settings/products`.
- [ ] Breadcrumbs and active-state highlighting are correct for all moved routes.
- [ ] Where a result has a linked customer (or an order has a linked result), the link is shown; missing FKs are flagged as a follow-up, not blocking.
- [ ] Permission-based visibility still hides entries the user cannot access.

## Blocked by

None - can start immediately.
