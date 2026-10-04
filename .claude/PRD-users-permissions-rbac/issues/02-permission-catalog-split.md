# Slice 02 — Permission catalog: one key per page (no behaviour change)

Type: AFK
Parent: PRD `users-permissions-rbac`
Triage: ready
Status: done
User stories covered: 3, 24, 37

## What to build

Split the coarse permission keys so each Admin Panel sidebar page has exactly one key, while the role matrix is still in code. Nobody's access changes in this slice: every role that held a coarse key is expanded to all of the keys it split into.

1. **Catalog** (`lib/auth/permissions.ts`): replace the bare `ADMIN_PERMISSIONS` tuple with a catalog of entries `{ key, label, group, href?, surface, requires? }`. Keys per the PRD table, including the two `telegram.*` actions (unused by guards until slice 08). Keep `ADMIN_PERMISSIONS` / `Permission` as derived exports so imports keep compiling.
2. **Expanded matrix:** `ROLE_PERMISSIONS` rewritten with the new keys; `staff` → `users`; `results` → `results` + `appointments`; `inventory` → `inventory` + `configure` + `shopify-link`; `orders` → `orders` + `returns`; `page-builder` → `page-builder` + `partners` + `partner-applications` + `partner-commissions` + `faq` + `forms` + `rules-engine`.
3. **Re-key guards by directory** (each route names the page it serves):

   | Today | Directories | New key |
   |-------|-------------|---------|
   | `page-builder` | `api/partners*`, `api/partners-page`, `settings/partners*`, `components/partner` | `partners` |
   | `page-builder` | `settings/partner-applications` | `partner-applications` |
   | `page-builder` | `settings/partner-commissions` | `partner-commissions` |
   | `page-builder` | `api/faq/*`, `api/page-faq/*`, `settings/faq` | `faq` |
   | `page-builder` | `api/settings/forms/*`, `settings/forms` | `forms` |
   | `page-builder` | `api/settings/rules-engine/*`, `settings/product-builder/rules-engine*` | `rules-engine` |
   | `page-builder` | `settings/product-builder/{mappings,dimensions,filling-visuals}`, `settings/products/calibration` | `products` (see decisions) |
   | `page-builder` | `api/landing-sections/*`, `settings/page-builder` | `page-builder` (unchanged) |
   | `page-builder` | `api/site-settings` | `media` (see decisions) |
   | `inventory` | `settings/inventory/configure/*` | `configure` |
   | `inventory` | `settings/integrations/shopify`, `api/shopify/*` | `shopify-link` |
   | `inventory` | `api/mp-config/assist` POST | stays `inventory` (see decisions) |
   | `results` | `api/settings/appointments/*`, `settings/appointments` | `appointments` |
   | `results` | `settings/staff-management`, `api/staff` | stays `results` until slice 04 / 07 (see decisions) |
   | `orders` | `settings/rma*` and RMA APIs | `returns` |
   | `staff` | `api/admin/users*`, `api/staff/telegram-operators*`, `settings/admins` | `users` |

   When slice 07 moves `api/staff` writes to `users`, its GET stays readable with `results` (Results' measured-by picker) via `requireAnyAdmin(["results", "users"])`.
4. **Sidebar from catalog:** `settings-sidebar-nav.tsx` reads each item's `perm` from the catalog by href, so a page cannot be listed under one key and guarded under another.
5. **Bearer-or-admin** (`lib/auth/bearer-or-admin.ts`) callers re-keyed the same way (Easyship stays `shipping`, Shopify sync → `shopify-link`).

## Decisions made while building

- **Product Builder sub-routes → `products`.** `product-builder/{mappings,dimensions,filling-visuals}` and `products/calibration` serve the Products page's Visualize and Dimensions tabs, so they take the Products key; the tabs no longer check a second key (`canVisualize` removed). `products` and `page-builder` were held by exactly the same roles, so no one gains or loses.
- **`api/site-settings` → `media`, landing slots only.** Its only caller is the Media page (landing image slots). The route refuses any other key (403) and lists only `landing_*` rows: `media` is ticked by Blogs, Products, Partners and Page builder, and other keys (RMA return address, Results ops email, booking URLs) have their own routes behind their own pages (second review).
- **`api/mp-config/assist` POST stays `inventory`.** It writes the Filling Template catalog that the Inventory page also sells from; `lib/configurator/staff-assist.check.ts` keeps asserting it.
- **`api/shop/products/sync-inventory` → `requireAnyAdmin(["products", "inventory"])`**, not `shopify-link`: it is Products' "Sync from Inventory" (inventory → storefront), not a Shopify call.
- **Shared Inventory server actions** (`settings/inventory/actions.ts`) name the pages that call them: Shopify mapping actions used by both Inventory and Shopify Link take `assertAnyAdmin(["inventory", "shopify-link"])` (new guard); Shopify-Link-only ones take `shopify-link`; `syncShopifyPricesOnly` (Costings) takes `assertAnyAdmin(["costings", "shopify-link"])`. The Shopify sales queue on Orders keeps `inventory` — it writes stock, and viewers (Orders without Inventory) must not gain it.
- **Staff Management stays on `results` until slice 04.** Moving it to `users` now would take staff-name editing away from the `staff` role. The catalog lists it as `alsoAt` of `results`; only its Telegram tab moved from `staff` to `users`. `api/staff` is unchanged until slice 07.
- **`requires`:** `page-builder`, `blogs`, `partners`, `products` → `media` (each mounts the image picker, which calls `/api/media`); `categories` → `products` (it is a Products tab with no page of its own). Inventory's image picker is optional and does not require Media — the `staff` role has Inventory without Media today.
- **Owner and Admin** hold every catalog key, the two `telegram.*` actions included (no guard reads those until slice 08).

## Acceptance criteria

- [x] Every sidebar href maps to exactly one catalog page key, and every catalog page key has a sidebar href (`lib/auth/__tests__/permissions.test.ts` › permission catalog).
- [x] Test: for every legacy role, the new permission set is exactly the expansion of the old one (no gain, no loss).
- [x] Re-keyed routes: `lib/auth/__tests__/page-keys-by-route.test.ts` fails if any guard in a page's directories names another page's key; `app/api/__tests__/admin-read-gates.test.ts` proves a role holding only the new key is served and one holding only `page-builder` is refused.
- [x] No remaining guard uses `"staff"` as a permission key (it is no longer in the `Permission` type).
- [x] `requires` declared where a page calls another page's API; every legacy role is already closed under it.
- [x] Lint (0 errors), typecheck, unit tests pass; affected `*.check.ts` updated and passing; `graphify-out/` refreshed.

## Blocked by

None. Pure code, no migration.
