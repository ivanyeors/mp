# Every Admin Panel page has a View key and an Edit key; a tab that is a different job gets its own

Status: Accepted (owner, 2026-11-22; PRD `permissions-view-edit`)

Amends ADR 0023 and generalises ADR 0028 (i).

## Context

ADR 0023 made permissions one key per page and left view-only access to a later PRD. It expected
a second key per page, `<page>:read`. ADR 0028 (i) went the other way for Customers: the page key
`customers` became "see", and `customers-edit` (`requires: ["customers"]`) became "change". The
reason was that the sidebar, the page guard and every read already checked the page key, so only
the writes had to move.

The owner now wants that for every page, and for tabs that are a different job (2026-11-22). Three
directions were weighed:

- **A. View + Edit per page, tab rows where a tab is a different job** (chosen).
- **B. Extra rows only where someone asks** (an ad hoc `-edit` or tab key per request, like
  `categories` and `customer-import`).
- **C. A level per page and per tab** (None / View / Edit as one value).

## Decision

- **The page key is View.** It opens the page, its sidebar entry, and every read behind it. No key
  is renamed.
- **`<page>-edit` is Edit**: no href, `requires: [<page>]`. Every write path on the page (route
  `POST`/`PUT`/`PATCH`/`DELETE`, server action) requires it. `customers-edit` is the first of these.
- **A tab gets its own keys only if it is a different job or shows different data**:
  `<page>-<tab>` (View, requires the page) and `<page>-<tab>-edit` where it has writes. Every other
  tab follows its page.
- **Edit always comes with View** through `requires`, so the matrix stays boolean. The subset rule
  ("you cannot grant what you do not hold") and `togglePermission` work unchanged.
- **Pages with no writes have no Edit key** (Audit log, Docs, Showroom). Shopify link gets none
  either; it goes with the cutover.
- **Sending money back is its own key** (owner, 2026-11-22). An edit-only **Refund money** row sits
  under Orders (`orders-refund`, requires `orders-edit`) and under Returns (`returns-refund`,
  requires `returns-edit`). A role can process orders and returns without being able to refund.
  - Every staff path that reaches `refundPayment` requires a Refund money key: the Order refund, approving a
    refund request, cancelling a paid order, and the RMA refund. An AST test holds this.
  - Rejecting a refund request, cancelling an unpaid order, and releasing an authorization hold send no
    money back, so they stay with Edit.
  - On day one, every role holding `orders` or `returns` gets the matching refund key.
- **Cost price follows Costings on every page** (owner, 2026-11-22). Whoever sends cost or
  cost-based margin to a page checks `costings`, whatever the page's own key.
- **Moving a page's writes to Edit never removes access on the day it ships.** A data migration
  first gives every custom role the Edit key of each page it holds. Owners then untick.

## Consequences

- About 420 existing guard calls keep working: reads stay on the page key, and only write paths
  change, one page group at a time.
- An AST test (generalising `lib/auth/__tests__/customers-write-guard.test.ts`) fails if a page's
  write path is guarded by its View key alone.
- Pages pass `canEdit` from the server, as Customers does. There is no client permissions hook.
- The Roles grid shows View and Edit ticks per role, and indented tab rows. Each catalog entry
  carries one "what this unlocks" line.
- Edit is enforced on the server only. Browser reads under row-level security are SELECT-only, and
  every write goes through the service role.

## Rejected

- **Refunds inside Edit** (the first proposal). The owner rejected it: whoever processes orders or
  returns should not by default be able to send money back.

- **`<page>:read` as the second key** (ADR 0023's plan). The page key already means "see" in the
  sidebar, `permissionForHref`, `requireAdminPage` and every read. Adding a read key would mean
  re-keying all of them and migrating every stored role so nobody loses the page. ADR 0028 rejected
  it for Customers for the same reason.
- **C, a level per page and tab.** It turns the boolean matrix into values, which breaks
  `applyRequires`, the subset rule as written, and `admin_has_permission`. It renames every key, so
  about 420 guard calls and every stored role change at once, with the highest risk of locking
  someone out.
- **B, ad hoc rows.** It is what produced `categories` (writes only, tab always visible) and
  `customer-import`. It leaves every other page without view-only, and each new key is designed
  differently.
