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
      fixture line and every development-database line.
- [ ] vitest covers the filter schema (valid, invalid, dropped) and `applyCustomerFilters`,
      using a recording query stub.
- [ ] Searching `Tan, Mei`, `(test)` or `a%b` returns rows or an empty list, never an error.
- [ ] `bought=premium&last_order=over:12&readjusted=never` matches a hand-written SQL query on
      fixtures.
- [ ] The filtered list's URL, opened in a new tab, shows the same rows.
- [ ] `./scripts/graphify update .` is run in the same commit.
