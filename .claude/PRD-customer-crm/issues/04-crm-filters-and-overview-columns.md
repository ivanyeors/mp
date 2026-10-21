# 04 — CRM columns on the Customer overview, the filters that use them, and safe search

**Issue:** [#281](https://github.com/ivanyeors/mp/issues/281) (parent #277)
**Type:** AFK
**Blocked by:** 01; migration PRD slice 12 (`admin_customer_overview`)
**User stories:** 5, 9
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`

## Goal

Staff can find the customers who matter right now, for example *Premium buyers from over a
year ago who never re-adjusted*. They do it with filters that sit in the URL and cannot be
broken by what someone types.

## Purchase classes, in SQL, in step with the TypeScript

The filters need to know what each Customer bought. Today that knowledge lives in one
TypeScript function, `classifyOrderLine` (`lib/readjustment/purchases.ts:80-122`). It checks the
Result snapshot first, then the variant's product (bolster, pillow and `pillow_products.kind`),
and skips service lines. The courier path uses the same precedence.

- **Add a view, `customer_purchase_lines`.** One row per goods line on a counted Order, with
  `customer_id`, `order_id`, `order_item_id`, `paid_at`, `product_type` (pillow | bolster |
  accessory) and `tier` (premium | basic | null).
  - "Counted" means `paid_at` is set and the status is not one of `purchases.ts:30`'s
    exclusions.
  - The view is `security_invoker`, with select revoked from `anon` and `authenticated`.
- **Prove the two agree.** A `*.check.ts` runs `classifyOrderLine` and the view over the same
  fixture lines, and over every line in a development database, and fails on any difference.
  - This is the pattern the migration PRD uses for its import function: TypeScript previews,
    SQL is the authority, and a test keeps them equal.
  - Switching `purchases.ts` to read the view is a later choice, not part of this slice.

## Overview columns

`create or replace view admin_customer_overview` adds, without removing anything:

| Column | Meaning |
|---|---|
| `paid_orders` | count of counted platform **Orders** |
| `first_paid_at`, `last_paid_at` | the first and the latest of those |
| `bought` | `text[]` of `premium`, `basic`, `mbolster`, `accessory`, from `customer_purchase_lines` |
| `last_readjusted_at` | latest `start_at` of an `attended` **Re-adjustment booking** |
| `search_text` | `lower(email || ' ' || coalesce(first_name,'') || ' ' || coalesce(last_name,''))` |

## Filters

`lib/crm/customer-filters.ts` holds one zod schema for the Customers list's URL parameters,
and `applyCustomerFilters(query, filters)`.

- **Schema.** The schema covers:
  - the migration filters: account, source, consent and voucher;
  - `bought` (several values allowed);
  - `last_order` (`within:<months>` or `over:<months>`);
  - `readjusted` (`ever` / `never`);
  - `min_spend`;
  - `tags`;
  - `sort` (adding *last order* and *spend*).
- **Search.** Search becomes one `ilike` on `search_text`, with the pattern escaped by
  `escapeLikePattern` (`lib/auth/customer-identity.ts:31-33`).
  - No typed text goes into `.or()` anymore (ADR 0027 d).
  - This fixes the unescaped interpolation at `lib/ecommerce/admin/customers.ts:40`, where a
    search for `Tan, Mei` returns a 500 today.
- **Invalid parameters.** An unknown value, such as `bought=foo`, is dropped and the list shows
  a *"1 filter ignored"* note. It is never passed to the query.
- **One mapping for every caller.** `listAdminCustomers` reads the filters through this module.
  The RSC page, `GET /api/shop/customers` and slice 05's Segments then all share one mapping.

## Customers list

- A *Filters* panel with the controls above. Its state lives in the URL
  (`router.replace`, no history spam), so a filtered view is a link.
- A summary of the active filters above the table, each with ×, and *Clear all*.
- The table gains a *Last order* column on wide screens.

## Not in this slice

The same unescaped `.or()` pattern exists in `lib/ecommerce/admin/orders-list.ts:78`,
`lib/ecommerce/customers.ts:55`, `lib/ecommerce/orders.ts:33` and `lib/ecommerce/products.ts:90`.
The README records it so it is not lost. It is fixed separately, outside the CRM.

## Acceptance criteria

- [ ] The parity check passes: `classifyOrderLine` and `customer_purchase_lines` agree on every
      fixture line and every development-database line. — _not yet: passes on all 38 fixture
      lines against a local Postgres 16 with every migration applied; the development database
      run is ops (`CRM_CHECK_DATABASE_URL=… npx tsx lib/crm/purchase-lines.check.ts`)_
- [x] vitest covers the filter schema (valid, invalid, dropped) and `applyCustomerFilters`,
      using a recording query stub.
- [x] Searching `Tan, Mei`, `(test)` or `a%b` returns rows or an empty list, never an error.
- [x] `bought=premium&last_order=over:12&readjusted=never` matches a hand-written SQL query on
      fixtures.
- [x] The filtered list's URL, opened in a new tab, shows the same rows.
- [ ] `./scripts/graphify update .` is run in the same commit. — _not yet: the integrator
      rebuilds the graph after merging_

## Build notes

**What was built.**

- `lib/crm/customer-filters.ts`: one zod schema, `customerFiltersSchema`, for the list's URL
  parameters: `search`, `tags`, `account`, `source`, `bought` (comma list, any of),
  `last_order` (`within:N` / `over:N`, 1–120 months), `readjusted` (`ever` / `never`),
  `min_spend`, `sort` (adds `last-order` and `spend`), `page`, `limit`. `parseCustomerFilters`
  reads a URL through it key by key and names each dropped key in `ignored`.
  `applyCustomerFilters(query, filters, { now })` maps it onto the overview. `CustomerListQuery`
  has no `or`, so no caller can send one: search is one `ilike` on `search_text`, escaped with
  `escapeLikePattern`, and `tags` / `bought` are quoted array literals (`pgTextArray`), so a tag
  with a brace or quote cannot break `ov.{…}` either. Also: `CUSTOMER_FILTER_KEYS` (the keys
  that choose Customers, which a Segment saves), `describeCustomerFilters` (summary labels),
  `clearCustomerFilter(s)` and `monthsBefore` (Postgres's month arithmetic, clamped).
- **For slice 05:** a Segment stores `Object.fromEntries(customerFilterParams(filters))`, which
  are the list's own parameters, and reads them back with `parseCustomerFilters(new
  URLSearchParams(stored))` or `customerFiltersSchema`. A Segment and a link therefore go through
  one schema and one mapping.
- `lib/crm/purchase-lines.ts`: the TypeScript twin of the view (`purchaseLine`,
  `isCountedOrder`, `purchaseClass`, `boughtClasses`), built on `classifyOrderLine`.
  `NOT_A_PURCHASE` is now exported from `lib/readjustment/purchases.ts`. Nothing else changed
  there.
- `lib/crm/customer-overview.ts`: the six columns, plus `PURCHASE_CLASSES`.
- `lib/supabase/like-pattern.ts`: `escapeLikePattern` moved here unchanged, and
  `lib/auth/customer-identity.ts` re-exports it, so every importer still works. The list's
  filters module is shared with the client, and importing `customer-identity` would have pulled
  `supabaseAdmin` and the claim code into the browser bundle.
- Customers list: `customer-filters-panel.tsx` has the *Filters* panel (Bought checkboxes, Last
  order presets plus any value a link carries, Re-adjusted, Spent at least, Tags, each
  validated through the schema) and the summary (one chip per active filter, each with ×, then
  *Clear all*, which keeps the sort) with the *N filters ignored (keys)* note.
  `customers-client.tsx` now holds one `filters` object instead of a state per filter. It adds
  a *Filters* button with a count, the *Last order* and *Most spent* sorts, and a *Last order*
  column (`lg` and up). `page.tsx` passes the parse's `ignored` through.

**Migrations.**

- `20261020122000_customer_purchase_lines.sql`: the `customer_purchase_lines` view. It is
  `security_invoker`, revoked from anon and authenticated, and lists guest Orders' lines too, so
  the check covers every line.
- `20261020122100_customer_search_text_index.sql`: a trigram GIN index on the `search_text`
  expression over `customers`. The planner drops the view's other joins for a search, so the
  search is a filtered scan of `customers`.
- `20261020200000_customer_overview_crm_columns.sql`: the overview redefinition on its own. It
  keeps all 18 columns and adds `paid_orders`, `first_paid_at`, `last_paid_at`, `bought`,
  `last_readjusted_at` and `search_text`, aggregated in grouped subqueries.
- DB check: all migrations apply in order (`db-check.sh`, 165). As `authenticated` and `anon`,
  both views give *permission denied*; `service_role` reads them. Migration 12's
  `assert-12-account-status.sql` still passes.

**Tests.**

- `lib/crm/__tests__/customer-filters.test.ts` (rewritten). It covers the schema (valid, every
  invalid shape dropped and never queried, empty lists), Segment-style storage through the same
  schema, every mapping on a recording stub, the search cases escaped and never `or`, and the
  real supabase-js builder's URL (`search_text=ilike.%Tan, Mei%`, no `or=`). It also covers the
  PRD's list as three plain filters, the URL round trip of every filter, the summary labels,
  clearing, `monthsBefore` and `pgTextArray`.
- `lib/crm/__tests__/purchase-lines.test.ts`: every fixture line means what its `expect` says,
  the counted statuses equal `NOT_A_PURCHASE`, the SQL files' `status not in` lists equal
  `NOT_A_PURCHASE`, and `bought` ordering.
- `lib/crm/__tests__/purchase-lines-fixture.ts`: the shared fixture. It covers every precedence
  branch, every `order_status`, guest Orders, the acceptance Customers and the search Customers.
- `lib/crm/purchase-lines.check.ts`: the parity check. In one rolled-back transaction it
  inserts the fixture, then compares TypeScript with the view on every line in the database,
  checks the overview's new columns for the fixture Customers, and checks that the acceptance
  URL (through `applyCustomerFilters`, read the way PostgREST reads it) equals a hand-written
  query over the base tables. It also runs five searches. A mutated view (bolster precedence
  swapped) fails it.
- `lib/ecommerce/__tests__/admin-customers-list.test.ts`: `listAdminCustomers` reads through
  the module, so search is an escaped `ilike` with no `or`, and a dropped value is never sent.
- `app/[lang]/settings/customers/__tests__/crm-filters-render.test.tsx`: a link opens with its
  panel, its summary and its count; the plain list has no summary; the ignored note; the Last
  order column; the sorts.

**Deviations.**

- **Consent and voucher filters are not in the schema yet.** Their columns (`marketing_email`,
  `welcome_voucher_state`) come from migration slices 07 and 06, which build in parallel. The
  schema takes them as more `PARAM_SCHEMAS` keys, and the summary needs a label for each (the
  types require one).
- **The URL is written with `history.replaceState`, not `router.replace`.** This is migration
  12's and CRM 14's existing mechanism. It avoids re-running the RSC page on every keystroke and
  likewise adds no history entries.
- **`bought` is *any of*** the values ticked (`&&`), like `tags`. A pillow whose Tier is unknown
  (a Result with no `assigned_tier`, a pillow product variant with no pillow id) still counts in
  `paid_orders`, but adds nothing to `bought`.
- **A fully returned line still counts.** The view lists every goods line on a counted Order,
  as specified. `buildPurchaseList` also skips lines with no units left after returns. The
  slice did not ask for that, and `refunded` Orders are already excluded.
- `min_spend` reads `customers.total_spent`, the platform-only figure the list already shows.

**Left for ops.** Run the parity check against the development database (Supabase → Connect →
direct connection string) and tick the first box.
