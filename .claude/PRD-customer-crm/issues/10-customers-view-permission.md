# 10 — A view-only Customers permission

**Type:** AFK
**Blocked by:** 01
**User stories:** 17, 18
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:customers`, `area:auth`

## Goal

A role can be allowed to **see** the CRM without changing it. Viewing covers the list, detail,
timeline, notes, follow-ups and segments. Changing covers notes, follow-ups, segments,
customer details, addresses and reminder settings. Every Staff member who can see Customers
sees every follow-up (owner, 2026-10-20).

## Today

- **One key covers both.** `customers` is one key for the whole Customers page
  (`lib/auth/permissions.ts:49`). Every read and every write checks it. The three write routes:
  - `POST /api/shop/customers` (`app/api/shop/customers/route.ts:31-32`);
  - `PATCH /api/shop/customers/[id]` (`[id]/route.ts:30-31`);
  - `POST /api/shop/customers/[id]/addresses` (`addresses/route.ts:39-40`).
- **Role rows store closed sets.** `requires` is applied when a role is saved
  (`lib/auth/permission-matrix.ts:3,19`), and `grants_all` covers Owner and Admin
  (`permissionsForRoleRow`, `permissions.ts`).

## Design

**`customers` keeps meaning "see the Customers page", and a new tab-level key grants
changes.** This follows `categories` (`requires: ["products"]`):

```ts
{ key: "customers-edit", label: "Customers: make changes (Customers page)", group: "Store", surface: "admin-panel", requires: ["customers"] },
```

Splitting this way, rather than adding a `customers-view`, means:

- the sidebar href, the page guards and every existing read keep the key they have today;
- only the handful of write paths change.

**Nobody loses anything.** A data migration adds `customers-edit` to every `admin_roles` row
that is not `grants_all` and holds `customers`:

```sql
update admin_roles
   set permissions = array_append(permissions, 'customers-edit')
 where not grants_all
   and 'customers' = any(permissions)
   and not 'customers-edit' = any(permissions);
```

- Making a role view-only is then one untick on **Users & permissions → Roles**.
- `ROLE_PERMISSIONS` gains `customers-edit` for `manager` and `staff`, so the seed and the data
  agree. `permissions.test.ts` asserts that.
- `viewer` does not gain `customers`. The owner ticks it if wanted.

## What each key allows

| Surface | `customers` (view) | `customers-edit` |
|---|---|---|
| List, filters, segments, detail, timeline, follow-ups (all of them) | yes | yes |
| Edit name, phone or tags; add an address; create a Customer | — | yes |
| Add or delete a note (CRM 02) | — | yes |
| Create, complete or reassign a follow-up (CRM 06); appear in the assignee picker | — | yes |
| Save, update or archive a segment (CRM 05) | — | yes |
| Aftercare settings (CRM 07, 08) | see them | change them |
| Link, unlink or reject a Google review match (CRM 12) | see matches | yes |
| A Customer's aftercare switches, email and WhatsApp (CRM 13) | see them and their history | flip them |
| Telegram update types (CRM 14) | see them | change them, *Send test*; the online Result type also needs `results` |
| Customer import (migration slice 02) | — | requires `customers-edit` (`customer-import` now `requires: ["customers-edit"]`) |

**The UI.** Without `customers-edit`, the edit controls are not rendered. The server refuses
writes regardless.

**The assignee picker** lists only Staff profiles whose **Member** holds `customers-edit`. A
follow-up therefore never lands on someone who cannot mark it done.

## Guard test

A `*.check.ts` lists every non-GET handler under:

- `app/api/shop/customers/**`;
- `app/api/settings/customers/**`;
- any server action in `app/[lang]/settings/customers/**`.

It asserts that each one calls `requireAdmin("customers-edit")` or `assertAdmin("customers-edit")`.
A new write path left on `customers` fails CI. Every later CRM slice adds its routes under these
paths.

## Acceptance criteria

- [ ] After the migration, every role that could edit Customers still can. This is checked
      against a snapshot of `admin_roles` taken before the migration.
- [ ] A role with `customers` and without `customers-edit` sees the whole CRM, gets a 403 from
      every write route, and sees no edit controls.
- [ ] The guard test fails when a write handler checks `customers`.
- [ ] Unticking `customers` on a role also unticks `customers-edit`, through the existing
      `requires` logic.
- [ ] `./scripts/graphify update .` is run in the same commit.
