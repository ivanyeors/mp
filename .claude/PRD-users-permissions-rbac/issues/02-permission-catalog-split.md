# Slice 02 — Permission catalog: one key per page (no behaviour change)

Type: AFK
Parent: PRD `users-permissions-rbac`
Triage: ready
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
   | `page-builder` | `settings/product-builder/{mappings,dimensions,filling-visuals}`, `settings/products/calibration` | decide per route: `products` or `rules-engine` (record the choice in this file) |
   | `page-builder` | `api/landing-sections/*`, `api/site-settings`, `settings/page-builder` | `page-builder` (unchanged) |
   | `inventory` | `settings/inventory/configure/*` | `configure` |
   | `inventory` | `settings/integrations/shopify`, `api/shopify/*`, `api/shop/products/sync-inventory` | `shopify-link` |
   | `inventory` | `api/mp-config/assist` | stays `inventory` (fill-template read for Staff assist mode) — confirm |
   | `results` | `api/settings/appointments/*`, `settings/appointments` | `appointments` |
   | `results` | `settings/staff-management`, `api/staff` (writes) | `users` |
   | `orders` | `settings/rma*` and RMA APIs | `returns` |
   | `staff` | `api/admin/users*`, `api/staff/telegram-operators*`, `settings/admins` | `users` |

   `api/staff` GET stays readable with `results` (Results' measured-by picker) via `requireAnyAdmin(["results", "users"])`.
4. **Sidebar from catalog:** `settings-sidebar-nav.tsx` reads each item's `perm` from the catalog by href, so a page cannot be listed under one key and guarded under another.
5. **Bearer-or-admin** (`lib/auth/bearer-or-admin.ts`) callers re-keyed the same way (Easyship stays `shipping`, Shopify sync → `shopify-link`).

## Acceptance criteria

- [ ] Every sidebar href maps to exactly one catalog page key, and every catalog page key has a sidebar href (`*.check.ts` + unit test).
- [ ] Test: for every legacy role, the new permission set is exactly the expansion of the old one (no gain, no loss).
- [ ] `settings-routes-guarded.test.ts` / `admin-read-gates.test.ts` extended: each re-keyed route refuses a role lacking the new key and allows one holding it.
- [ ] No remaining guard uses `"staff"` as a permission key.
- [ ] `requires` declared where a page calls another page's API (at least `page-builder` → `media`, `blogs` → `media`); verified by reading each page's fetches.
- [ ] Lint, typecheck, unit tests pass; `graphify-out/` refreshed.

## Blocked by

None. Pure code, no migration.
