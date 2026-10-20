# 12 — Account status on every Customer, and the Customer overview

**Type:** AFK
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

- [ ] Signing in as a Customer with no account sets `account_linked_at` once, and a later sign-in
      does not move it. Deleting the auth user clears it.
- [ ] The backfill gives every already-linked row a date, and no unlinked row one.
- [ ] `account_last_seen_at` is written at most once an hour per Customer, and a failing write
      does not break `/account`.
- [ ] `admin_customer_overview` cannot be selected with the anon key or as an authenticated
      Customer. The Supabase security advisor reports nothing new.
- [ ] The *from Shopify + no account* filter matches
      `migrated_customers join customers where auth_user_id is null`, counted by hand.
- [ ] The migration card's numbers match the same hand-counted queries.
- [ ] vitest covers the list's filter-to-query mapping as a pure function.
- [ ] `./scripts/graphify update .` is run in the same commit.
