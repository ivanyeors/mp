# 10 — A view-only Customers permission

**Issue:** [#287](https://github.com/ivanyeors/mp/issues/287) (parent #277)
**Type:** AFK
**Status:** built in `38a8880` on `claude/shopify-migration-plan-izv7fo`
**Blocked by:** 01
**User stories:** 17, 18
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`, `area:customer-accounts`

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

- [x] After the migration, every role that could edit Customers still can. This is checked
      against a snapshot of `admin_roles` taken before the migration.
- [x] A role with `customers` and without `customers-edit` sees the whole CRM, gets a 403 from
      every write route, and sees no edit controls.
- [x] The guard test fails when a write handler checks `customers`.
- [x] Unticking `customers` on a role also unticks `customers-edit`, through the existing
      `requires` logic.
- [x] `./scripts/graphify update .` is run in the same commit.

## Build notes

**Built.**

- `lib/auth/permissions.ts`: the `customers-edit` catalog entry, exactly as designed above, placed
  after `customers` so the Roles matrix lists it beside its page. `ROLE_PERMISSIONS` gains it for
  `manager` and `staff`; `viewer` gains neither key.
- The three write routes (`POST /api/shop/customers`, `PATCH /api/shop/customers/[id]`,
  `POST /api/shop/customers/[id]/addresses`) and the `updateCustomer` server action
  (`app/[lang]/settings/customers/actions.ts`, which had no callers) now check `customers-edit`.
  Every GET and both pages stay on `customers`.
- Customer detail: the page passes `canEdit = hasPermission(ctx, "customers-edit")`. Without
  it, the client renders name, phone, tags and notes as text, and leaves out the name and phone
  inputs, the tag editor, the notes textarea, *Save Changes* and *Add Address*. The Customers
  list has no edit controls today.
- `lib/auth/permission-matrix.ts`: unticking a page also unticks its tabs (see the deviation).

**Migration.** `20261020102000_customers_edit_permission.sql` is the `update` above, with the
idempotency clause. Verified on Postgres 16 (`mp_c10`): every migration before it applied, then
`admin_roles` was seeded beside the five seeded roles with a `grants_all` row that also lists
`customers`, a custom role with `customers`, one without it, one already holding
`customers-edit`, and an empty one, and snapshotted. After the migration, measured against the
snapshot: no role that held `customers` or `grants_all` lost the ability to edit (0 rows); each
role's keys equal the snapshot plus `customers-edit` exactly where it held `customers` and not
`grants_all` (0 differences); no role without `customers` gained it, and no `grants_all` row
changed. The first run updated 3 rows (Manager, Fulfilment, the custom role); a second run
updated 0, with no duplicate keys. A full run from scratch applies all 154 migrations, and leaves
Manager and Fulfilment holding both keys and Viewer neither, which matches `ROLE_PERMISSIONS`.

**Tests.**

- `lib/auth/__tests__/customers-write-guard.test.ts` is the guard test. It is a vitest test, not a
  `*.check.ts`, because CI runs only `pnpm test` (`.github/workflows/ci.yml`) and no workflow runs
  the `*.check.ts` scripts. It parses each `.ts`/`.tsx` file under the three roots with the
  TypeScript compiler. Every POST, PUT, PATCH or DELETE handler, every export of a `"use server"`
  file, and every inline `"use server"` function must call `requireAdmin`, `requireAdminContext`
  or `assertAdmin` with `customers-edit` or a key that requires it. A helper or a string
  constant in the same file counts; `requireAnyAdmin` does not. The roots are walked, so a file a
  later slice adds is checked the day it lands (tried with a new `notes/route.ts` and a
  `segments/actions.ts`, both on `customers`: both failed). Outside the roots, any write that
  checks `customers` without `customers-edit`, anywhere in `app/`, `lib/` or `components/`,
  fails too. Fixtures prove each failure mode.
- `app/api/shop/customers/__tests__/customers-edit-routes.test.ts`: a view-only role reads all
  three GETs (200), gets a 403 from all three writes, has `updateCustomer` throw `Forbidden`, and
  changes nothing. `customers-edit` and Owner write; a role without `customers` is refused
  everything.
- `app/[lang]/settings/customers/__tests__/customer-detail-render.test.tsx`: with `canEdit` every
  edit control renders; without it none does, and the Customer's facts still show.
- `permissions.test.ts`: `customers-edit` is a Customers tab requiring `customers`; every seeded
  role that sees Customers can change them; `viewer` has neither. The seed test now checks *seed
  plus data migrations* against `ROLE_PERMISSIONS`, and pins the migration's SQL. The no-loss split
  test records `customers` → `customers` + `customers-edit`.
- `permission-matrix.test.ts`: unticking `customers` unticks `customers-edit`, with a note.
  Unticking `customers-edit` leaves the role view-only. Ticking `customers-edit` ticks
  `customers`. A page's tabs go with it, and a page that uses another still blocks the untick.

**Deviation: unticking now cascades to tabs.** The existing `requires` logic never unticked
anything: `togglePermission` *blocked* unticking a page that another ticked key required ("… uses
Customers. Untick it first."), so the fourth criterion could not hold through it unchanged. The
smallest change that meets it: unticking a page also unticks its **tabs** (Admin Panel keys with
no sidebar page of their own that require it, transitively), and says so in a toast. A ticked
key that is a page of its own still blocks, as before (Page Builder still blocks Media). This also
changes Products → Categories (Products tab) the same way, which is the precedent this key
follows. The server is unchanged: `normalizeRolePermissions` still closes a saved list upward.

**For the integrator.**

- CRM 02's note routes and migration slice 02's import routes will fail the guard test until
  they check `customers-edit`, or until `customer-import` becomes `requires: ["customers-edit"]`.
  The test accepts any key whose closure includes `customers-edit`, so `customer-import` passes
  once it does. The cascade then unticks `customer-import` along with `customers-edit`.
- Not edited, and now stale: `CONTEXT.md` → **Permission** says "in v1, no view-only level", and
  ADR 0023's last consequence says view-only would be a `<page>:read` key. Slice 01 (glossary and
  ADR 0027 (i)) owns both.
- The assignee picker filter ("profiles whose Member holds `customers-edit`") belongs to CRM 06,
  which has not been built yet.

**For ops (optional).** To repeat the snapshot check in production, save the output of
`select key from admin_roles where not grants_all and 'customers' = any(permissions) order by key;`
before the deploy. After it, `select key from admin_roles where not grants_all and
'customers-edit' = any(permissions) order by key;` must list every one of those keys.
