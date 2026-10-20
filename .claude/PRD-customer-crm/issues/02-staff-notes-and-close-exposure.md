# 02 — Staff notes customers cannot read, and closing the live exposure

**Issue:** [#279](https://github.com/ivanyeors/mp/issues/279) (parent #277)
**Type:** AFK
**Blocked by:** 01
**User stories:** 1, 2, 10
**Labels:** `bug`, `enhancement`, `needs-triage`, `P1`, `area:admin`

## Goal

Notes become a dated, authored history that only Staff can read. In the same change, the
customer's own key stops being able to read `customers.notes`, `customers.tags` and
`orders.internal_notes`, which it can today (PRD audit §1).

This slice does not depend on the migration PRD. It is **P1** because the exposure is live.

## Schema (one migration)

```sql
create table customer_notes (
  id                uuid primary key default gen_random_uuid(),
  customer_id       uuid not null references customers(id) on delete cascade,
  body              text not null check (length(btrim(body)) between 1 and 5000),
  author_profile_id uuid null references mp_staff(id) on delete set null,
  author_user_id    uuid null references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  deleted_at        timestamptz null,
  deleted_by_profile_id uuid null references mp_staff(id) on delete set null
);
create index on customer_notes (customer_id, created_at desc) where deleted_at is null;
```

RLS is on, with a service-role-only policy and no `authenticated` or `anon` policy.

**Backfill:**

- Every non-empty `customers.notes` becomes one note, with no author and
  `created_at = customers.updated_at`.
- The UI shows such a note as *"Notes before {date}"*.
- `customers.notes` is then left unwritten. Dropping it is a later migration, once a release
  has run without it.

## Column grants

Follow `20260915170000_hide_variant_cost_price.sql:41-46`, which revokes the table grant and
re-grants column by column. A column-level REVOKE alone does nothing (its own comment, :14-16).

```sql
revoke select on public.customers from anon, authenticated;
grant select (id, email, first_name, last_name, phone, locale, auth_user_id,
              total_orders, total_spent, created_at, updated_at)
  on public.customers to authenticated;      -- not notes, not tags

revoke select on public.orders from anon, authenticated;
grant select (/* every column except internal_notes */) on public.orders to authenticated;
```

**Before writing the grant lists:**

- **List the columns from the live schema, not from `0028`.** Many migrations have added to
  `orders`.
- **Re-check the `customers` grant against every later migration.** If migration PRD slice 07
  has landed, add `marketing_email` to the grant, because the customer is meant to read it.
  Otherwise slice 07 adds it. Whichever lands second adds the grant.
- **Fix the order reads.** `lib/shop/customer-orders.ts:16-17` selects `*` from `orders` under
  the shopper's RLS, which would fail once the grant lands. Replace `*` with an explicit list,
  as the `order_items` part of the same string already does.
- **Check every other read of `customers` or `orders` under the shopper's key.** Today the only
  other one is `lib/shop/customer-addresses.ts:38-41`, which selects `id` only.

## Admin Panel

- **Notes card**, replacing the textarea at `customer-detail-client.tsx:775-788`:
  - a box and **Add note** at the top, then the notes, newest first;
  - each note shows the author's profile name and the date;
  - the author, or an Owner or Admin (`AdminContext.grantsAll`), can delete a note, and a
    deletion is soft;
  - reading is behind `customers`; adding and deleting are behind `customers-edit`.
- **Writes.** `POST /api/shop/customers/[id]/notes` and `DELETE …/notes/[noteId]`. Each calls
  `requireAdmin("customers-edit")` (slice 10; use `customers` if this slice lands first, and
  slice 10's guard test moves it) and takes the author from `getAdminContext` plus
  `getWorkingAs`. Each writes `recordAdminAction` (`customer_note.create` / `.delete`), with the
  note id and no body.
- **Fix the silent save** (PRD audit §1):
  - The client sends only the fields that changed.
  - The PATCH route accepts `null` to clear a name, rather than rejecting an empty string with
    `min(1)` (`app/api/shop/customers/[id]/route.ts:11-12`).
  - The client checks `res.ok` and shows the error.
  - The PATCH writes `recordAdminAction` (`customer.update`), with before and after snapshots of
    the changed fields only.
- **Delete the unused server action** `app/[lang]/settings/customers/actions.ts`. Nothing calls
  it, and it is a second write path.

## Acceptance criteria

- [x] As a signed-in customer, a direct database API call for `customers.notes`,
      `customers.tags`, `orders.internal_notes` or `customer_notes` is refused or returns
      nothing. This is a `*.check.ts` that signs in as a fixture customer.
      — _`lib/shop/customer-privacy.check.ts`. Verified on Postgres 16 as `authenticated`
      (each is "permission denied"); its live mode needs a Supabase project, and CRM 09 runs
      it on production._
- [x] `/account`, `/account/orders`, an order's detail page, `/account/addresses` and
      `/appointments?type=readjustment` all still work for a customer. This is the same check,
      reading each path.
      — _every select those pages run under the customer's key was run as `authenticated` on
      Postgres 16 and works; the check opens the pages too when given
      `CUSTOMER_CHECK_SITE_URL`._
- [x] Existing notes appear as the first note, with no author and the old date.
- [x] Adding and deleting a note writes an audit row with no note text.
- [x] Saving a Customer with no name succeeds. A failed save shows an error.
- [ ] `./scripts/graphify update .` is run in the same commit. — _not yet: the integrator
      refreshes the graph after merging._

## Build notes

**Built**

- `supabase/migrations/20261020101000_customer_notes_and_column_grants.sql`: `customer_notes`
  (schema as above, RLS on, a `to service_role` policy, `revoke all` from anon and
  authenticated), the backfill, and the two column grants.
- `lib/crm/notes.ts` (server: list, create, `noteProfileFor`) and `lib/crm/note-rules.ts`
  (shared with the browser: `NoteInputSchema`, `CustomerNote`, `canDeleteNote`).
- `GET` / `POST /api/shop/customers/[id]/notes` and
  `DELETE /api/shop/customers/[id]/notes/[noteId]`. The writes, and the PATCH, check
  `customers-edit` (CRM 10, merged in); `GET` stays on `customers`.
- `lib/crm/customer-patch.ts`: `UpdateCustomerSchema` (strict; `null` or `""` clears a name or
  phone; no `notes`) and `changedCustomerFields`, used by both the client (send only what
  changed) and the PATCH route (write and audit only what changed, as `customer.update`).
- Admin Panel: `customer-notes-card.tsx` replaces the textarea; the page reads the notes on the
  server and passes `viewer` (`userId`, `grantsAll`). CRM 10's one `canEdit` flag
  (`customers-edit`) drives both its edit controls and the Notes card's add box and delete
  buttons; without it the notes read as text. The Save button now sits above the Notes card,
  since notes save on their own. Saves and note actions show a toast on failure.
- `lib/shop/customer-orders.ts`: `CUSTOMER_ORDER_COLUMNS` / `CUSTOMER_ORDER_ITEM_COLUMNS`
  replace `*`, and the reads return `CustomerOrder` (`Omit<Order, "internal_notes">`).
- Deleted `app/[lang]/settings/customers/actions.ts`; `dead-surface.test.ts` keeps it gone.
  CRM 10 had moved it to `customers-edit`; on merge the deletion stands, and CRM 10's tests drop
  its `updateCustomer` cases (the guard test now expects the two note routes instead).
  `POST /api/shop/customers` no longer accepts `notes`.
- `.env.example` documents the check's optional `CUSTOMER_CHECK_*` variables.

**Grants.** Columns listed from the migrated schema, not `0028`: `orders` has 48, and
`authenticated` gets 47 (all but `internal_notes`); `customers` gets 11 (not `notes`, `tags`).
`anon` gets neither table (it had no policy on them). The RLS policies on `customers`,
`orders`, `order_items` and `customer_addresses` read only `id`, `customer_id` and
`auth_user_id`, all granted. Under the customer's key, the only reads of these tables are
`lib/shop/customer-orders.ts` and `customer-addresses.ts` (`id`); every other account, order
and booking read is the service role. No browser-client or RPC read touches either table.
Migration slice 07's `marketing_email` is not on `main` yet, so slice 07 adds it to the grant.

**Tests.** `lib/ecommerce/__tests__/cost-column-grants.test.ts` now covers `customers` and
`orders` (and reads multi-column `alter table … add column …, add column …` statements), checks
the customer order column lists against the grants, and that `customer_notes` is server-only.
A new column on either table fails it until it is granted or listed as hidden.
`app/api/shop/customers/__tests__/notes-routes.test.ts` (list, add, delete, permissions,
working-as attribution, audit rows without text, PATCH with no name, changed-only audit, and a
view-only role refused every note write and the PATCH).
`lib/crm/__tests__/customer-patch.test.ts` (schema, diff, note rules). CRM 10's render test now
passes notes and a viewer, and counts *Add note* and the delete button as edit controls.

**DB check.** `db-check.sh` (which now emulates Supabase's default privileges) passes on
`mp_c02` after merging CRM 10 (155 migrations). With a fixture customer: before the
migration the customer's role read `notes`, `tags` and `internal_notes`; after it, those,
`select *` on both tables and every
`customer_notes` access are "permission denied", while the storefront's own selects, the
address writes and RLS isolation between two customers still work. The backfill is idempotent,
skips blank notes, and dates the note from `customers.updated_at`.

**Deviations**

- A note written with no "Working as" profile chosen uses the login's only profile when it has
  exactly one (`noteProfileFor`); on a shared login with none chosen it names no profile, and
  the note shows the login's email. The slice says "from `getAdminContext` plus
  `getWorkingAs`", which alone would leave every personal login's notes without a profile name.
- "The author" may delete means the author's login (`author_user_id`), not the profile:
  "Working as" is attribution only (`lib/staff/working-as.ts`), so it never authorises.
- A legacy note longer than 5,000 characters is cut to 5,000 in `customer_notes` to meet the
  body check; the full text stays in `customers.notes`. The migration that drops the column must
  check for one first.
- A note with neither author is shown as moved from the old box ("Notes before {date}"). A real
  note whose profile and login were both later deleted would read the same; the schema has no
  flag to tell them apart.

**Left for ops / others**

- Run `lib/shop/customer-privacy.check.ts` live (CRM 09, on production with the owner's login).
- Deploy order: code first, then the migration (as `20260915170000` required).
- Migration slice 06 cites `updateCustomer` (`actions.ts:11`), which no longer exists: it should
  use the PATCH route.
