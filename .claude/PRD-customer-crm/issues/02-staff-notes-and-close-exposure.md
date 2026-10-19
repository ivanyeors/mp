# 02 — Staff notes customers cannot read, and closing the live exposure

**Type:** AFK
**Blocked by:** 01
**User stories:** 1, 2, 10
**Labels:** `bug`, `enhancement`, `needs-triage`, `P1`, `area:customers`, `area:privacy`, `area:db`

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
  - the card is behind `customers`.
- **Writes.** `POST /api/shop/customers/[id]/notes` and `DELETE …/notes/[noteId]`. Each calls
  `requireAdmin("customers")` and takes the author from `getAdminContext` plus
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

- [ ] As a signed-in customer, a direct database API call for `customers.notes`,
      `customers.tags`, `orders.internal_notes` or `customer_notes` is refused or returns
      nothing. This is a `*.check.ts` that signs in as a fixture customer.
- [ ] `/account`, `/account/orders`, an order's detail page, `/account/addresses` and
      `/appointments?type=readjustment` all still work for a customer. This is the same check,
      reading each path.
- [ ] Existing notes appear as the first note, with no author and the old date.
- [ ] Adding and deleting a note writes an audit row with no note text.
- [ ] Saving a Customer with no name succeeds. A failed save shows an error.
- [ ] `./scripts/graphify update .` is run in the same commit.
