# PRD: View and Edit per page (Admin Panel permissions)

Status: Ready. The owner answered every decision on 2026-11-22 (see "Owner decisions" below).
Source: Owner, 2026-11-22, while closing the #455 known issues: "our pages have sub-pages / tabs, so design options for us to also allow sub-page/tab view/edit permission". The owner chose option A, View + Edit per page, over B (extra rows only where needed) and C (a None / View / Edit level per page and tab).
ADR: `docs/adr/0055-view-and-edit-keys-per-page.md` (Accepted, owner, 2026-11-22)
Builds on: PRD `users-permissions-rbac` (done), ADR 0023, ADR 0028 (i)

## Problem Statement

A **Role** today holds one box per Admin Panel page. Ticking it lets a **Member** open the page and change everything on it. That is too coarse in three ways:

- **No look-but-don't-touch.** A Member who only needs to read Orders, Costings or Shipping can also change, refund, reprice or reconfigure there. Customers is the one page already split (`customers` to see, `customers-edit` to change, ADR 0028 i). Every other page has one key.
- **Tabs are a different job hidden behind one box.** Users & permissions has a Roles tab that changes what everyone can do. Shipping has a Couriers tab that holds the Easyship connection and webhook. Campaigns has a Send step that emails real customers. Each comes with its page's box, all or nothing.
- **Pages quietly need another page's box.** The Roles screen doesn't show it, so a role that looks right is broken or leaks:
  - The Review SLA section on General (`api-configs`) reads and saves through `/api/results/sla-settings`, which requires `results` (`app/api/results/sla-settings/route.ts:61,81`).
  - Page FAQs (`components/settings/page-faqs-panel.tsx:113`) and the Discount editor (`app/[lang]/settings/discounts/[id]/discount-editor-client.tsx:333`) load their product picker from `/api/shop/products`, which requires `products` (`app/api/shop/products/route.ts:8`). Without it the picker is an empty list.
  - Cost price is meant to be Costings data, but it leaves the server under other boxes. The Inventory page gets every item's cost from `getInventoryCostingState`, under `inventory` (`app/[lang]/settings/inventory/actions.ts:418-422`). The Products page and product editor show and edit variant cost under `products` (`products-client.tsx:139`, `[id]/product-editor-client.tsx:1241`). Analytics' "Sales & margin" tab shows margin under `analytics`. On live data, the Marketing role holds `products`.

The owner's decisions (2026-11-22): pages and tabs get View and Edit. Cost price follows the **Costings** box everywhere. Sending money back to a customer is its own box, **Refund money**, under Orders and under Returns.

## Solution

From the owner's side:

- The Roles grid gets two ticks per role on every page row: **View** (open the page and read it) and **Edit** (change anything on it). Ticking Edit ticks View. Unticking View unticks Edit.
- A tab that is a different job gets its own indented row under its page, with its own View and Edit. Every other tab follows its page.
- Orders and Returns each get an edit-only **Refund money** row. A role can process orders and returns without being able to send money back.
- Every row has one plain line saying what it unlocks, e.g. "Costings: sell prices and cost prices, wherever they appear".
- A Member with View but not Edit sees the page as it is, with inputs read-only and the buttons that change things hidden. If they try anyway, the server refuses (403).
- On day one nobody loses or gains anything. Every role that can open a page today keeps Edit on it until the owner unticks it.

From the developer's side:

- The key scheme extends what Customers already does. The page key stays the View key. A new `<page>-edit` key, with no href and `requires: [<page>]`, is Edit. A tab row is a key with no href that requires its page (`<page>-<tab>`), plus `<page>-<tab>-edit` where the tab has writes. `isTab` (`lib/auth/permission-matrix.ts:10-13`) and the "a key without a page is a tab reached through one that has" test (`lib/auth/__tests__/permissions.test.ts:194-200`) already describe these keys.
- Every write path (route `POST`/`PUT`/`PATCH`/`DELETE`, server action) on a page moves from `<page>` to `<page>-edit`. Reads stay on `<page>`. An AST test per page (generalising `lib/auth/__tests__/customers-write-guard.test.ts`) fails if a write path names only the View key.
- Pages learn whether to show edit controls the way Customers does today: the server page computes `canEdit = hasPermission(ctx, "<page>-edit")` and passes it as a prop. There is no client permissions hook.

## Domain language (lands in `CONTEXT.md` with slice 01)

| Term | Meaning | Avoid |
|------|---------|-------|
| **View** | Holding a page's key: open the page, its sidebar entry, and every read behind it. | "read permission" as a separate concept from the page key |
| **Edit** | Holding a page's `-edit` key: every change on that page. Always comes with View. | Edit without View; per-button keys |
| **Tab row** | A tab or sub-page with its own View/Edit because it is a different job or shows different data. Every other tab follows its page. | A row for every tab |
| **Read-only mode** | How a page looks with View and no Edit: the same data, inputs disabled, change buttons hidden. | Hiding data in read-only mode (that is a View question, not Edit) |
| **Refund money** | The edit-only row under Orders and under Returns that lets a Member send money back to a customer (a Stripe refund), including by cancelling a paid order. Requires that page's Edit. | Treating refunds as part of Edit; releasing an authorization hold (no money was taken, so it is not a refund) |

**Permission** is amended: a page has a View key and, where it has writes, an Edit key. The "no view-only level except on Customers" clause goes.

## User Stories

1. As an Owner, I want each page row on the Roles grid to have View and Edit ticks per role, so that I can let someone look without letting them change.
2. As an Owner, I want ticking Edit to tick View and unticking View to untick Edit, with a note saying so, so that a role can never edit a page it cannot open.
3. As an Owner, I want tabs that are a different job (for example Users & permissions › Roles, Shipping › Couriers, Campaigns › Send) on their own indented rows, so that I can give the page without that tab.
4. As an Owner, I want one line under each row saying what it unlocks, so that I can see what a box exposes (cost prices, customer details, sending email) before I tick it.
5. As an Owner, I want every role that has a page today to keep Edit on it after the change, so that nobody is locked out on the day it ships.
6. As a Member with View only, I want to see the page with its data and no change buttons, so that I am not offered actions I cannot take.
7. As a Member with View only, I want any change I try anyway (an old tab, a direct request) to be refused, so that hiding a button is never the only protection.
8. As an Owner, I want pages that use another page's data to work with their own box, so that a role that looks right on the grid is right (Review SLA, the product pickers on Page FAQs and Discounts).
9. As an Owner, I want cost price to show only for roles with Costings, on every page, so that one box decides who sees cost.
10. As a non-Owner who manages users, I can only grant View and Edit I hold myself, so that the subset rule still holds.
11. As a developer, I want a test that fails if a page's write path is guarded by its View key, so that a new button cannot skip Edit.
12. As an Owner, I want refunding to be its own box under Orders and Returns, so that a role can process orders and returns without being able to send money back.
13. As a developer, I want a test that fails if any staff path that sends a Stripe refund is guarded by anything weaker than a Refund money key, so that a new refund button cannot skip it.

## Implementation Decisions

### Keys

- **View** is the existing page key (`orders`, `shipping`, …). Nothing is renamed, so the ~420 existing guard calls and every stored role keep working. Reads stay on it.
- **Edit** is `<page>-edit`: no href, `requires: [<page>]`, label "<Page>: make changes", like `customers-edit` today. `customers-edit` is already this key, and stays as it is.
- **Tab rows** are `<page>-<tab>` (View, `requires: [<page>]`) and `<page>-<tab>-edit` (`requires: [<page>-<tab>]`), only for the tabs in the table below. A tab without a row follows its page's View and Edit.
- **`customer-import`** stays as it is: an edit-only row under Customers that requires `customers-edit`.
- **Refund money** (owner decision 5): `orders-refund` (requires `orders-edit`) and `returns-refund` (requires `returns-edit`). Both are edit-only rows, labelled "Refund money", and are the only keys that let a staff path send a Stripe refund.
- **`categories`** becomes the Categories tab row's Edit key in meaning. Today any `products` holder sees the Categories tab, and `categories` guards its writes (`/api/shop/categories` POST, `[id]` PATCH/DELETE, `reorder` PUT, `categories/actions.ts:8`). It keeps its key, so no stored role changes. See decision 4.
- **Pages with no writes** get no Edit key: their row shows View only. Today that is Audit log, Docs and Showroom; no write routes or actions exist under their folders.
- **Shopify link** gets no Edit key. Shopify is being replaced (CLAUDE.md), and its page goes with the cutover.
- **Telegram actions** are unchanged. They are already one action each.
- **`requires: media` carries over to Edit.** Page Builder, Blogs, Partners, Products and Campaigns require `media` because they mount the image picker. Picking an image is a read, and uploading one is a write, so each of those pages' Edit key also requires `media-edit` (slice 08).
- `grants_all` roles (Owner, Admin) get every new key automatically, because `permissionsForRoleRow` expands `grants_all` to the whole catalog (`lib/auth/permissions.ts:137-140`).
- Catalog today (verified 2026-11-22): 36 keys. 32 are Admin Panel keys: 29 pages with an href, plus `customers-edit`, `customer-import` and `categories`. The other 4 are Telegram keys.

### Pages and tab rows

"Row" means the tab gets its own View/Edit. A tab earns a row only if it is a different job, or shows data its page's View should not.

| Page (key) | Tabs / sub-pages | Edit key | Tab rows | Why |
|---|---|---|---|---|
| General (`api-configs`) | API configs, Claude key, AI writing | `api-configs-edit` | none | One job, setting up integrations. Review SLA moves to Results (decision 6). |
| Appointments | Calendar, settings sheet, readjustments | `appointments-edit` | none | One job |
| Users & permissions (`users`) | Members, Staff profiles, Roles, Telegram | `users-edit` | **Roles** (`users-roles`, `users-roles-edit`) | Changing a role changes what everyone can do; managing members is a different, lower-risk job |
| Docs | Docs, meta-testers, points, staff-orders | none | none | Read only |
| Customers | Customers, Follow-ups, Reviews, Settings; Import | `customers-edit` (exists) | **Import** (`customer-import`, exists) | Already split (ADR 0028, 0029) |
| Results | Status tabs, result detail, Review SLA (moved from General) | `results-edit` | none | One job. Review SLA's key was always `results`. |
| Orders | List, detail | `orders-edit` | **Refund money** (`orders-refund`, edit-only) | Sending money back is a different job from processing orders (decision 5) |
| Returns / RMA (`returns`) | List, detail | `returns-edit` | **Refund money** (`returns-refund`, edit-only) | Same (decision 5) |
| Email campaigns (`campaigns`) | List, editor: Write / Send / Results; Funnel | `campaigns-edit` | **Send** (`campaigns-send`, edit-only) | Sending emails real customers; drafting doesn't |
| Email templates | List, detail | `email-templates-edit` | none | One job |
| Inventory | One page with cart and sell drawers | `inventory-edit` | none | Cost on it follows Costings (below) |
| Costings | Costings; Service fees | `costings-edit` | none | Both are prices |
| Products | Products, In the shop, Categories; editor | `products-edit` | **Categories** (decision 4) | Categories already has its own key |
| Configure | Products, Product Visualize, Dimensions, Soft body; card; calibration | `configure-edit` | none | One job |
| Rules Engine | List, flow | `rules-engine-edit` | none | One job |
| Discounts | Codes, editor, points | `discounts-edit` | none | One job |
| Shipping | Methods; Couriers: Connection, Addresses, Boxes, Rules, Tracking, Webhook | `shipping-edit` | **Couriers** (`shipping-couriers`, `shipping-couriers-edit`) | The Easyship account set-up, pushed to Easyship (ADR 0021); a different job from editing methods |
| Page Builder | Landing or slide-in builder | `page-builder-edit` | none | One job |
| Partners | Partners, Work With Us, Agreement | `partners-edit` | none | Applications and commissions are already pages of their own |
| Partner applications | | `partner-applications-edit` | none | |
| Partner commissions | | `partner-commissions-edit` | none | |
| Blogs, FAQ, Forms, Media | FAQ: Global, Page FAQs | `<page>-edit` each | none | One job each |
| Analytics | Sales & margin, Stock & builds, Customers, Traffic & search | `analytics-edit` (annotations, SEO targets, AI report import) | none (decision 7) | Margin follows Costings instead of getting a row |
| Audit log | | none | none | Read only |
| Showroom | | none | none | Read only |
| Shopify link | | none | none | Being retired |

### Cost price follows Costings

Wherever cost price, cost-based margin or COGS leaves the server for a page, the server sends it only to a Member with `costings`. Everyone else gets `null`, and the page shows nothing in its place (no "$0", no blank column header). Writes that set cost refuse without `costings-edit`. This covers:
- Inventory's `getInventoryCostingState` and the item editor's cost writes (`inventory/actions.ts:569, 596`). A separate pull request is already in flight for this, following PR #459.
- Variant cost on Products and the product editor (`/api/shop/products/[id]/variants*`, a money path).
- Margin on Analytics › Sales & margin, and the Costings KPIs.

The database side is already in place for the browser read of `item_prices` (`admin_has_permission('costings')`, PR #459).

### Migration (no one loses access)

One data migration, applied **before** any guard moves:
- Every custom role that holds a page key gets that page's `-edit` key and its tab rows (View and Edit).
- Every custom role that holds `orders` gets `orders-refund`, and every one that holds `returns` gets `returns-refund`. Today those keys let a role refund (`app/api/shop/orders/[id]/refund/route.ts:90`, `rma/actions.ts:105`), so nobody loses refunding on day one.
- `customers-edit` and `customer-import` are already stored and are left alone.
- `grants_all` roles are skipped.
- Old code ignores the new keys on read (`permissionsForRoleRow` filters with `isPermission`), so the migration is safe to apply while the current build is serving.
- It is idempotent and only adds. The guard (`.claude/hooks/guard.mjs`) allows it, but it touches `supabase/`, so the owner reviews it.

Live roles (read 2026-11-22): admin and owner (`grants_all`), fulfilment, manager, marketing and viewer. The slice re-reads them before it runs.

### Roles grid

- Columns are still roles. Each role column splits into **View | Edit** for every row with an Edit key; a View-only row shows one tick.

  ```
  Page                         Manager       Marketing
                               View  Edit    View  Edit
  CRM
  Orders                        [x]   [x]     [ ]   [ ]
    Refund money                      [ ]           [ ]
  Returns / RMA                 [x]   [x]     [ ]   [ ]
    Refund money                      [x]           [ ]
  INVENTORY
  Costings                      [x]   [ ]     [ ]   [ ]
  STORE
  Products                      [x]   [x]     [x]   [x]
    Categories                  [x]   [x]     [x]   [ ]
  Shipping                      [x]   [ ]     [ ]   [ ]
    Couriers                    [x]   [ ]     [ ]   [ ]
  INSIGHTS
  Audit log                     [x]           [ ]
  GENERAL
  Users & permissions           [x]   [ ]     [ ]   [ ]
    Roles                       [ ]   [ ]     [ ]   [ ]
  ```

  (Illustration only. On day one every role keeps Edit and Refund money on what it holds today.)
- Tab rows are indented under their page.
- Under each label is one muted line, "what this unlocks", from a new catalog field `unlocks`. A test requires it on every Admin Panel key.
- `togglePermission` (`lib/auth/permission-matrix.ts`) already does most of the work. Ticking Edit adds View through `requires`. Unticking View removes its tab keys (`tabsOf`), and since Edit keys are href-less keys that require the page, they come off too. The toast says "Also turned off Orders: make changes — it needs Orders." No new rule is needed. A slice test proves it for an Edit key and a tab row.
- On a phone, the per-role checklist shows each row with two switches.
- Header copy changes to: "View opens a page. Edit lets them change it. New pages are off for custom roles until you turn them on."

### Read-only mode

- The server page passes `canEdit` (and `canEditTab` where a tab has a row) to its client, as Customers does (`app/[lang]/settings/customers/page.tsx:65`).
- Without Edit, inputs render disabled, and Save, Delete, Create and row actions are not rendered. Data is never hidden by read-only mode.
- A failed write shows the server's "You don't have permission to change this" (403), never a generic error.

### Guards

- Writes move to `<page>-edit` (or the tab's `-edit`), one page group per slice. A shared write used by two pages takes `assertAnyAdmin` / `requireAnyAdmin` with both Edit keys, as today's shared Inventory actions do.
- `page-write-guard.test.ts` generalises `customers-write-guard.test.ts`: a table of page → folders. For every exported write method or `"use server"` export in them, the guard must name a key whose `requires` closure includes that page's Edit key. Each slice adds its pages to the table, so the test grows with the rollout.
- `page-keys-by-route.test.ts` accepts a page's Edit and tab keys inside its folders.

### Refund paths (owner decision 5; money path)

Every staff refund goes through `refundPayment` (`lib/stripe/refunds.ts:12`), from four places (verified 2026-11-22):

| Path | Today | Moves to |
|---|---|---|
| `POST /api/shop/orders/[id]/refund` (the Order's refund dialog) | `orders` (`route.ts:90`) | `orders-refund` |
| `POST /api/shop/orders/[id]/refund-request`, `action: "approve"` (approving a customer's refund request) | `orders` (`route.ts:27`) | `orders-refund`; `reject` sends no money and takes `orders-edit` |
| `POST /api/shop/orders/[id]/cancel`, on a paid order (refunds while cancelling) | `orders` (`route.ts:16`) | `orders-refund` when it refunds; `orders-edit` when there is nothing to refund |
| `issueRmaRefund` (`app/[lang]/settings/rma/actions.ts:104`) | `returns` (`:105`) | `returns-refund` |

- Not staff paths, so unchanged: the customer's own `/api/account/orders/[orderNumber]/refund-request` and `cancel`, and the Stripe webhook.
- Releasing an authorization hold (Result cancel or decline) takes no money back, so it stays with Edit.
- The Order and RMA pages hide Refund, Approve refund and Cancel and refund without the refund key. Cancel without refund stays with Edit.
- `refund-guard.test.ts` is an AST test. Every module under `app/` that imports `refundPayment` must guard each exported route or action that reaches it with a key whose `requires` closure includes `orders-refund` or `returns-refund`. Customer `app/api/account/**` routes and the Stripe webhook are named exceptions, each with its reason. A new staff refund path that uses only `orders-edit` fails.

### Database (RLS)

- The browser reads some tables as the signed-in Member (Costings, Inventory, Configure, Results detail, Analytics). Those Staff read policies are SELECT-only (`20260902000000_rls_hardening_and_hot_path_indexes.sql:129-157`), and every write goes through a server route or action with the service role. So Edit needs no database change.
- View stays as it is, except for cost price, which `admin_has_permission('costings')` already covers.

### Modules

| Module | Change |
|--------|--------|
| Permission catalog (`lib/auth/permissions.ts`) | Edit and tab keys, `unlocks` line, catalog tests |
| Permission matrix (`lib/auth/permission-matrix.ts`) | Unchanged logic; tests for Edit/tab behaviour |
| Roles grid (`app/[lang]/settings/users/roles-tab.tsx`) | View/Edit columns, indented tab rows, `unlocks` line |
| Each page's server page + client | `canEdit` prop, read-only mode |
| Each page's routes/actions | Writes move to `-edit` |
| Guard tests (`lib/auth/__tests__/`) | `page-write-guard.test.ts`; `page-keys-by-route.test.ts` table |

## Testing Decisions

| What | Automated? | Check |
|------|-----------|-------|
| Catalog | Yes | Every page with a write path has an Edit key; every Edit and tab key requires its page; every Admin Panel key has `unlocks` |
| Toggle | Yes | Ticking Edit ticks View; unticking View unticks Edit and tab rows, with the note |
| Migration | Yes (SQL against a local copy, as `scripts/check-rbac-migrations.sh` does) | For every live role, the permissions after the migration are a superset of before, with exactly the expected `-edit` keys added; running it twice changes nothing |
| Write guards | Yes | `page-write-guard.test.ts` fails if a write path in a listed folder names only the View key (shown failing on the old code in each slice) |
| Refund guards | Yes | `refund-guard.test.ts` fails if a staff path reaching `refundPayment` is guarded below a Refund money key; route tests: Orders Edit without Refund money gets 403 on refund, approve and paid cancel, and is served on reject and unpaid cancel |
| Route gates | Yes | For one write per page: a role with View only gets 403, a role with Edit is served |
| Read-only mode | Yes, per page group | Renders with `canEdit={false}`: no Save/Delete in the DOM, inputs disabled |
| Cost follows Costings | Yes | Each cost-returning server path returns `null` cost for a role without `costings` |
| Grid look | Preview skill | Desktop and phone screenshots of the Roles tab |
| End to end | Staging QA (HITL) | Three logins: Owner, a View-only role, a role with Edit on one page |

## Out of Scope

- A level column (None / View / Edit) or a rename of existing keys (option C, rejected in ADR 0055).
- Per-button or per-field permissions beyond the tab rows listed.
- Per-member overrides (ADR 0023 still holds).
- Telegram actions.
- Partner Hub and Customer access.

## Owner decisions (2026-11-22)

1. **Tab rows:** exactly Users › Roles, Shipping › Couriers, Campaigns › Send (edit-only), Customers › Import (exists) and Products › Categories, plus the Refund money rows from decision 5. Considered, not now: Products › In the shop (listing toggles), Users › Telegram, Customers › Reviews, Partners › Agreement.
2. **Edit always comes with View**, through `requires`: a role can't edit a page it can't open.
3. **Audit log, Docs and Showroom are View only**, with no Edit tick, because nothing on them changes data.
4. **Categories** is a tab row whose View follows Products and whose Edit is today's `categories` key, so no stored role changes.
5. **Refunds get their own row.** An edit-only **Refund money** row under Orders (`orders-refund`) and under Returns (`returns-refund`), each requiring that page's Edit. A role can process orders and returns without being able to send money back. Every staff path that sends a Stripe refund moves to it, and an AST test holds it (slice 12). On day one, every role holding `orders` or `returns` gets the matching refund key, so nobody loses access. This changes the original proposal, which kept refunds inside Edit.
6. **Review SLA** moves from General to the Results page, where its key (`results`) already is.
7. **Analytics margin and cost** follow Costings, with no extra row.
8. **Shopify link** gets no Edit key; it goes with the cutover.
9. **Day-one migration:** every role holding a page today gets its Edit key (and the refund keys in decision 5), so nothing changes until the owner unticks.

## Further Notes

- Slices live in `.claude/PRD-permissions-view-edit/issues/`.
- Every slice that changes guards states its failing-then-passing check, per CLAUDE.md "Done means checked".
- Slices touching money paths (`.claude/rules/money.md`: Costings, Discounts, refunds, Returns, Partner commissions, product variant prices) get the `reviewer` subagent's second check, and wait for the owner.
