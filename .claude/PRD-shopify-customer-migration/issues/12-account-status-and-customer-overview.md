# 12 — Account status on every Customer, and the Customer overview

**Issue:** [#276](https://github.com/ivanyeors/mp/issues/276) (parent #264)
**Type:** AFK
**Status:** built in `a49f8d6` on `claude/shopify-migration-plan-izv7fo`
**Blocked by:** 02
**User stories:** 8, 14
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`

## Goal

Staff can see, for every **Customer** and not only the imported ones, whether that person has
signed up, since when, and when they were last signed in. Straight after an import, the owner
can filter to *"from Shopify, not signed up yet"* and watch that list shrink.

This slice is also the first piece of the CRM (PRD, *Toward a simple CRM*). The Admin Panel
gets one read model per Customer, and every later slice adds columns to it rather than writing
its own query.

## What is missing today

- The Customers list shows Name, Email, Orders, Spent, Tags and Joined
  (`app/[lang]/settings/customers/customers-client.tsx`). It says nothing about accounts.
- An account is a `customers` row with `auth_user_id` set (`0037_customer_auth.sql:4-5`), but
  nothing records **when** it was linked. `linkCustomerToAuthUser` only writes `auth_user_id`
  (`lib/auth/customer-identity.ts`).

## Schema

```sql
alter table customers
  add column account_linked_at    timestamptz null,
  add column account_last_seen_at timestamptz null;
```

- **`account_linked_at` is set by a trigger, not by app code**, so every path that binds a login
  sets it: `before insert or update of auth_user_id on customers`.
  - When `auth_user_id` goes from null to a value, the trigger sets `now()`.
  - When it becomes null, because the login was deleted (`on delete set null`), the trigger
    clears the date. The date always describes the current login.
- **Backfill.** Set already-linked rows from `auth.users.created_at`; the migration runs as the
  owner role and can read it. For rows linked before this migration, the date is therefore
  when the login was created, the closest fact there is. The detail page says so in a tooltip.
- **`account_last_seen_at`.** `linkCustomerToAuthUser` already runs on every account page.
  - It also sets this column, but only when the stored value is more than an hour old: one
    conditional update.
  - Failures are swallowed, as `recordAdminAction` does, so it never blocks a page.
  - It means *the last time they opened an account page while signed in*, not the last site
    visit, and the UI labels it that way.
- **Not used for this:** `user.last_sign_in_at`. It is on the session user, and
  `lib/auth/partner.ts:110` reads it that way, but it records sign-ins, not visits: a customer
  whose session lasts a month shows a month-old date however often they come back.
  `account_last_seen_at` records visits. Storing `last_sign_in_at` would still need no
  `auth.users` join and no `supabase.auth.admin.*` call.

## The Customer overview

The Customer **detail** page reads `customers` directly through `getAdminCustomer`
(`lib/ecommerce/admin/customers.ts:79`), not through the list. Moving `listAdminCustomers` onto
the view does not reach it, so the detail page's Account card reads the same columns itself.


```sql
create view admin_customer_overview with (security_invoker = true) as
select
  c.id, c.email, c.first_name, c.last_name, c.phone, c.tags,
  c.total_orders, c.total_spent, c.created_at,
  c.auth_user_id is not null          as has_account,
  c.account_linked_at, c.account_last_seen_at,
  m.customer_id is not null           as from_shopify,
  m.created_by_import, m.imported_at, m.claimed_at,
  m.shopify_orders_count, m.shopify_amount_spent
from customers c
left join migrated_customers m on m.customer_id = c.id;

revoke all on admin_customer_overview from anon, authenticated;
```

- **List columns explicitly, never `c.*`.** A view freezes `*` when it is created, and an
  explicit list keeps staff-only columns from riding along by accident.
- **`security_invoker`**, so the service-role-only RLS on `migrated_customers` still applies.
- **Statuses are derived here, never stored as text.** "Signed up" is `has_account`. No status
  column can drift from the facts it summarises.
- **Later slices extend it** with `create or replace view`, adding only columns:
  - 07 adds `marketing_email`;
  - 06 adds the Claim link's `first_clicked_at` and the voucher state;
  - 08 adds `last_campaign_sent_at`.

## Admin Panel

`listAdminCustomers` (`lib/ecommerce/admin/customers.ts:24`) reads the view instead of
`customers`. `GET /api/shop/customers` and the RSC page both get the new fields with no change.

### Customers list

- **An Account column.** *Signed up* with the date, or a muted *No account*. On small screens it
  shows as a badge under the name, because the table hides columns there.
- **A *Shopify* badge** beside the name of every Migrated customer.
- **Filters:**
  - Account: *all / signed up / no account*;
  - Source: *all / from Shopify / platform*.

  Together these give the list that matters during the migration: from Shopify, no account.
  The filters live in the URL, so a link to that list can be shared.
- **Sort:** add *recently signed up*.

### Customer detail

- **Account card.** *Signed up on {date}*, or *No account yet: they become a signed-up customer
  the first time they sign in with {email}*, plus *last signed-in visit*.
- **From Shopify card**, only for Migrated customers:
  - imported on {date}, linking the batch in the import history;
  - matched to an existing Customer, or created by the import;
  - Shopify-era orders and spend, labelled *"on Shopify, not linked to this account"*;
  - Shopify tags and note;
  - consent at export;
  - claimed on {date}, once slice 05 is live.

### Migration card (Customers page header)

The card shows once at least one batch is applied. It is visible to anyone with `customers`.

| Imported | Signed up |
|---|---|
| N (created *a*, matched *b*) | *s* (*s / N* %), of which *k* already had an account before import |

Slices 06 and 08 add *Emailed*, *Clicked*, *Voucher used* and *Revenue* to this card, so it grows
into the funnel in user story 11 without a second card.

## Acceptance criteria

- [x] Signing in as a Customer with no account sets `account_linked_at` once, and a later sign-in
      does not move it. Deleting the auth user clears it.
- [x] The backfill gives every already-linked row a date, and no unlinked row one.
- [x] `account_last_seen_at` is written at most once an hour per Customer, and a failing write
      does not break `/account`.
- [x] `admin_customer_overview` cannot be selected with the anon key or as an authenticated
      Customer. The Supabase security advisor reports nothing new.
      — _verified on production 2026-10-21: neither role holds SELECT on the view, which is
      `security_invoker`. The advisor's three warnings are the ones it gave before the
      migrations; its 13 new notes are informational "RLS enabled, no policy" on the new
      server-only tables_
- [x] The *from Shopify + no account* filter matches
      `migrated_customers join customers where auth_user_id is null`, counted by hand.
- [x] The migration card's numbers match the same hand-counted queries.
- [x] vitest covers the list's filter-to-query mapping as a pure function.
- [x] `./scripts/graphify update .` is run in the same commit.

## Build notes

**What was built.**

- `lib/crm/customer-overview.ts`: the TS read model. `CUSTOMER_OVERVIEW_COLUMNS` (the view's
  columns, in order) and `CustomerOverviewRow`. A later slice adds its column here and in the view.
- `lib/crm/customer-filters.ts`: one zod-backed reader of the list's URL parameters
  (`parseCustomerFilters`, which drops and names an invalid value), `applyCustomerFilters` (pure,
  over the query's `or`/`overlaps`/`eq`/`order`), and `customerFilterParams` for the URL. CRM 04
  extends this file. URL values: `account=signed-up|no-account`, `source=shopify|platform`,
  `sort=signed-up` (hyphens, like the existing `name-asc`).
- `lib/ecommerce/admin/customers.ts`: `listAdminCustomers` reads `admin_customer_overview`
  through the filters. `getAdminCustomer` is unchanged; the Account card reads the row's own
  `auth_user_id`, `account_linked_at` and `account_last_seen_at`.
- `lib/auth/customer-identity.ts`: `touchCustomerLastSeen` (and `lastSeenIsStale`), its own
  block below `linkCustomerToAuthUser`, called as one line before `return customer`. It skips the
  write while the stored value is under an hour old, and the update re-checks the value it read
  (`.is(null)` or `.lt(now − 1h)`), so of two concurrent loads only one writes. Errors and throws
  are swallowed.
- `lib/customer-migration/overview.ts`: `getMigrationSummary` (the card) and
  `getMigratedCustomer` (the From Shopify card, with its batch embedded). Neither throws.
- Customers list (`page.tsx`, `customers-client.tsx`, `migration-card.tsx`): the Account column
  (*Signed up* with its date, or a muted *No account*; a badge under the name below `md`), the
  *Shopify* badge, Account / Source / Sort selects (*Recently signed up* added), and the Migration
  card. Search, tags, account, source and sort live in the URL (`history.replaceState`, as on
  Users & permissions); the RSC page reads them and renders that list first. The card's
  *N from Shopify not signed up yet* link applies the filter in place.
- Customer detail (`[id]/customer-account-cards.tsx`): the Account card (*Signed up on {date}*
  with the backfill tooltip, or *No account yet …{email}*; *Last signed-in visit*, labelled as an
  account page opened while signed in) and the From Shopify card (imported on, the batch, matched
  or created, Shopify-era orders and spend *on Shopify, not linked to this account*, tags, note,
  consent at export, and *Claimed on* once `claimed_at` is set).

**Migration.** `supabase/migrations/20261020111000_customer_account_status_and_overview.sql`:
the two columns; the backfill from `auth.users.created_at` with `trg_customers_updated_at` held
off, so `updated_at` is untouched; the `before insert or update of auth_user_id` trigger; a check
`(auth_user_id is null) = (account_linked_at is null)`; `admin_customer_overview` exactly as
specified; and `admin_customer_migration_summary`. Both views are `security_invoker` and revoked
from `anon, authenticated`. Verified on Postgres 16 with every migration, from a database seeded
*before* this migration (two linked rows and one guest): the linked rows got their logins'
`created_at`, the guest none, `updated_at` unchanged; a re-run changes nothing. Then: a first
link stamps `now()`; the same login written again (with or without a supplied date) keeps it; a
new login re-stamps; deleting the auth user nulls both columns through `on delete set null`; an
insert without a login drops a supplied date. anon and an authenticated Customer get `permission
denied` on both views and on the two new columns; the service role reads both. The *from Shopify
+ no account* list and every card number equal the hand-counted joins.
`supabase/tests/customer-migration/assert-12-account-status.sql` replays all of this in a rolled
back transaction (`psql -v ON_ERROR_STOP=1 -f …` on a database with the migrations applied).

**Tests.**

- `lib/crm/__tests__/customer-filters.test.ts`: the filter-to-query mapping over a recording stub
  (*from Shopify + no account* → `eq has_account false`, `eq from_shopify true`), dropped values,
  sorts, and the URL round trip.
- `lib/crm/__tests__/customer-overview-view.test.ts`: the latest definition of each view has
  exactly the TS columns in order; every redefinition only appends; no `*`; `security_invoker`;
  revoked and never granted to `anon` / `authenticated`.
- `lib/auth/__tests__/customer-last-seen.test.ts`: the hour rule, the conditional update's
  filters, swallowed errors and throws, and `linkCustomerToAuthUser` still returning the Customer
  when the write fails.
- `lib/customer-migration/__tests__/overview.test.ts`: the card's row reader and percentage, and
  the From Shopify reader.
- `app/[lang]/settings/customers/__tests__/account-status-render.test.tsx`: the Account column,
  the Shopify badge, the filter controls, the card (shown from the first applied batch), and both
  detail cards.
- `lib/ecommerce/__tests__/cost-column-grants.test.ts`: the two columns are on the customers
  hidden list.

**Deviations.**

- **A second view for the Migration card**, `admin_customer_migration_summary`, aggregated from
  the overview, rather than counting in TypeScript. One query, and the card cannot disagree with
  the *From Shopify* filter. Slices 06 and 08 append their funnel columns to it, and to
  `MIGRATION_SUMMARY_COLUMNS`, the same way as the overview. *Already had an account before
  import* is `account_linked_at <= imported_at`.
- **The trigger also ignores a date app code supplies** (with the same login, it keeps the old
  value; without a login, it clears it), and a check constraint holds the date to the login. The
  backfill falls back to `customers.created_at` for an `auth.users` row with no `created_at`, which
  GoTrue never writes, so the check cannot fail.
- **The two columns are not granted to the customer's own key.** No customer surface reads them.
- **The card shows from the first batch ever applied** (an undone one included) and counts every
  `migrated_customers` row, whatever batch made it, so kept rows of an undone batch still count.
- **The batch link** is `/settings/customers/import#batch-<id>`, rendered only for a viewer with
  `customer-import` (others see the file name). Slice 03's history rows should carry
  `id="batch-<id>"`; until then the link lands on the import page.
- **`account_last_seen_at` comes from every `linkCustomerToAuthUser` call**, which includes the
  account API routes (orders, addresses, results, reviews) as well as the pages. The UI says
  *opened one of their account pages while signed in*. An hourly write also moves
  `customers.updated_at`, which nothing reads.
- **Search is unchanged**: the unescaped `.or()` moved from `lib/ecommerce/admin/customers.ts:40`
  to `applyCustomerFilters`. CRM 04 replaces it.

**After merging CRM 13, CRM 14 and Migration 05.**

- The Customers page header and the *Import from Shopify* button now belong to CRM 14's
  `customers-page-tabs.tsx`; the list tab (`CustomersClient`) holds the Migration card above its
  filters, and no longer takes `canImport`. The header's tooltip carries the *signed up* / *no
  account* wording. The list rewrites only its own URL keys (`CUSTOMER_FILTER_PARAMS`), so the
  tabs' `?view=` survives.
- The detail page shows the Account card, then CRM 13's Aftercare card, then Stats and From
  Shopify.
- `linkCustomerToAuthUser` runs Migration 05's `claimOnSignIn`, the guest-order link, then the
  last-seen touch.
- CRM 14's seam `countSignUps` (`lib/crm/telegram-update-sources.ts`) is filled: two `head: true`
  counts on the overview, by `account_linked_at` in the window, and the same with
  `from_shopify`. `created_by_import` rows are not excluded: the import never sets
  `account_linked_at`, so such a row counts only on the day its owner first signs in, which is the
  Claim the migration wants counted. New sign-ups and the Weekly summary's sign-ups line now post.
  `lib/crm/__tests__/telegram-updates-job.test.ts` gained the overview fixture and a test of the
  real count.

**Production (2026-10-21).** Shipped in #293. The code deployed first, then all 30 migrations of
both PRDs, the order #293's audit set: this slice's migration on its own could go first, but
CRM 02's column grants cannot. Production's schema and grants then matched a local build of the
same migrations, and the Supabase security advisor reported no new warning (above).
