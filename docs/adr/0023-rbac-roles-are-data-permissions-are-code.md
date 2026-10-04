# Admin Panel RBAC: roles are data, permissions are code

Status: Proposed (PRD `users-permissions-rbac`)

Migration `0038_admin_rbac.sql` put the role → permission matrix in `lib/auth/permissions.ts` so it
was deterministic and unit-testable, and kept only membership, role name and active state in
`admin_users`. That made every change to who-sees-what a code change and a deploy, and it left
two more access lists outside it: `mp_staff` (measuring staff, owned by no login) and
`telegram_operators` (review-card buttons, its own roles). This record replaces the matrix half
of that decision and folds the other two lists in.

## Decisions

- **The catalog stays in code; the matrix moves to data.** A permission is a thing the code can
  check — one per Admin Panel page, plus each Telegram action — so its key, label, sidebar group
  and dependencies live in `lib/auth/permissions.ts`, and a check for a key that does not exist
  fails to compile. Which roles hold which keys is a business decision, so it lives in
  `admin_roles.permissions` and is edited on Users & permissions. Unknown keys in a stored role are
  ignored on read, so retiring a page never breaks a role.
- **One key per page.** A permission names exactly one sidebar page. Coarse keys that gated
  several pages (`page-builder`, `inventory`, `results`, `orders`, `staff`) are split before the
  matrix becomes editable, with the code matrix expanded the same way, so the split changes no
  one's access.
- **Owner and Admin grant everything, including the future.** They are `grants_all` system roles,
  not long lists, so a new page is never missing from them. Every other role is custom and gets
  a new page only when someone ticks it — new features are closed by default.
- **No per-member overrides.** A Member holds exactly one role. A one-off access pattern is a new
  custom role, so the matrix on screen is the whole truth.
- **You cannot grant what you do not hold.** Anyone who is not `grants_all` can only create, edit or
  assign roles whose permissions are a subset of their own. Only an Owner grants or removes Owner,
  and the last active Owner cannot be removed.
- **People hang off logins.** A Staff profile (`mp_staff`) belongs to exactly one Member and never
  has more access than it. A Telegram link belongs to a Staff profile; its effective actions are
  the Member's role permissions intersected with the actions granted on the link, and only while
  the profile and the Member are both active. Deactivating a login therefore silences every
  profile and Telegram account under it.
- **Read per request, no cache.** `getAdminContext` loads the role with the Member in one query,
  memoised per request as today. A role or membership change takes effect on the caller's next
  request; there is no session claim to wait out.

## Consequences

- Guards keep their signatures (`requireAdmin("orders")`); only the role lookup changes, and
  `roleHasPermission(role, …)` callers move to `hasPermission(ctx, …)`.
- Tests can no longer assert "manager can see X" from code alone; they assert catalog integrity,
  the write rules, and that a role row with a key is allowed through a guard and one without it is
  refused.
- `admin_users.role` (text) and `telegram_operators.display_name` / `role` are kept during the
  expand phase and dropped once the new columns are the only ones read.
- View-only access is not modelled here; it is the next PRD. It is a second key per page
  (`<page>:read`), not a level column, so the subset rule and the matrix stay boolean.
