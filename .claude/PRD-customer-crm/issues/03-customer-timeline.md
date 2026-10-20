# 03 — One timeline on the Customer detail, merged when it is read

**Issue:** [#280](https://github.com/ivanyeors/mp/issues/280) (parent #277)
**Type:** AFK
**Blocked by:** 02
**User stories:** 3, 4
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`

## Goal

Open a **Customer** and see everything that has happened with them, newest first, on one
timeline. It is built from the tables that already record the history, with no copy and no
backfill (ADR 0027 b).

## Shape

`lib/crm/timeline/` holds one adapter per source, and a pure merge:

```ts
type TimelineEntry = {
  at: string;                 // ISO timestamp the entry sorts by
  kind: TimelineKind;         // e.g. "order.paid", "result.accepted", "note"
  ref: { type: string; id: string; href?: string };  // Admin Panel link
  summary: string;            // one line, no PII beyond what the detail page already shows
};

type TimelineAdapter = {
  kinds: readonly TimelineKind[];
  permission: Permission;     // the viewer must hold it, or the adapter is skipped
  load(customer: { id: string; email: string }, before: string | null, limit: number): Promise<TimelineEntry[]>;
};
```

- **`mergeTimeline(lists, limit)`** is pure. It sorts newest first, breaks ties by `kind` then
  `ref.id` so pages are stable, and returns `limit` entries plus the next cursor.
- **Bounded reads.** Each adapter returns at most `limit` rows older than `before`, so a
  Customer with years of history costs the same as a new one.
- **The route.** `GET /api/settings/customers/[id]/timeline?before=…&kinds=…` calls
  `requireAdmin("customers")`. It then runs only the adapters whose `permission` the viewer
  holds, using `getAdminContext().permissions`.

## Adapters in this slice

| Adapter | Source | Entries | Permission |
|---|---|---|---|
| orders | `orders` by `customer_id` | placed, paid, shipped, delivered, cancelled, refund requested | `orders` |
| order emails | `order_emails` joined to the Customer's orders, `status = 'sent'` | *"Email sent: {template label from the registry}"* | `orders` |
| results | `mp_config_responses` where `customer_id = id` **or** the lower-cased email matches, exactly as `lib/results/access.ts:30-36` does | *created* (`created_at`), with its current status as a pill; *build sent* (`assigned_at`); *balance paid* (`topup_paid_at`). A paired build is one entry for both Results (`paired_build_id`) | `results` |
| re-adjustments | `readjustment_bookings` by `customer_id` | booked (with Location and date), attended, no-show, cancelled | `appointments` |
| returns | `rma_requests` and `rma_status_events` by `customer_id` | opened, each status change | `returns` |
| reviews | `product_reviews` by `customer_id` | submitted, approved or rejected | `customers` |
| notes | `customer_notes` (slice 02), not deleted | the note, in full | `customers` |

**Results have no time per status.** `mp_config_responses` stores no time for accept, decline or
expiry, and `updated_at` moves on every reminder write. So the timeline never invents one:

- an accepted Result shows up as its **Order** (the orders adapter);
- a Staff cancel shows from `admin_audit_log` (`app/api/results/[id]/cancel/route.ts:132`), with
  the `results` permission;
- *declined* and *expired* show only as the Result's current status, never as a dated entry.

**Results emails are not in `order_emails`.** Emails such as `results.assigned` and
`results.paired_mbolster_removed` have no ledger, so the timeline cannot list them.

**Added later, by the slices that create the source:**

- CRM 06: follow-ups (created, done).
- Migration 02: imported, as **Migrated customer**.
- Migration 12: signed up (`account_linked_at`).
- Migration 05: claimed, and voucher issued or used.
- Migration 07: consent changes.
- Migration 08: campaign emails.

Each of those slices adds one adapter and its tests, and nothing else changes. This is the
hand-off point for `PRD-email-marketing` too: its sends appear through the campaign-sends
adapter.

## Admin Panel

- **Placement.** A *Timeline* card fills the detail page's left column, under Order History.
  Order History stays, because it is the quickest view of money.
- **Filters.** Chips by kind group (*Orders*, *Results*, *Re-adjustments*, *Returns*,
  *Reviews*, *Notes*). Only the groups the viewer may see are shown.
- **Paging.** It shows 50 entries, then *Load older*.
- **Entries.** Each links to its record (the order, the Result, the booking, the RMA) when the
  viewer holds that page's permission.

## Acceptance criteria

- [x] vitest covers `mergeTimeline`: order, stable ties, the cursor across pages, and empty
      sources.
- [x] A fixture Customer with an order, a guest Result matched by email (with different case
      and whitespace), a booking, a return and a note shows every event in order.
- [x] A role without `orders` sees no order or order-email entries. A role without `results`
      sees no Result entries. This is tested at the route.
- [x] A Result belonging to a different Customer, whose email merely contains this one's, is
      never shown.
- [ ] `./scripts/graphify update .` is run in the same commit. — _not yet: the integrator rebuilds the graph after merging_

## Build notes

**Built.**

- `lib/crm/timeline/`: `types.ts` (entry, batch, adapter, cursor), `merge.ts` (the pure
  `mergeTimeline`, `canonicalAt`, the sort order), `cursor.ts` (the opaque `before=` value),
  `read.ts` (bounded-read helpers: `readStream`, `streamBatch`, `joinBatches`, `cappedBatch`),
  `groups.ts` (the chips), `registry.ts` (`TIMELINE_ADAPTERS` and the **how to add a source**
  guide), `load.ts` (`loadTimeline`: permission gate, kind filter, link stripping, merge).
- Adapters in `lib/crm/timeline/sources/`: `orders.ts` (orders: one stream per dated column;
  order emails: `order_emails` sent rows via `orders!inner`, labels from `EMAIL_REGISTRY`),
  `results.ts`, `readjustments.ts`, `returns.ts`, `reviews.ts`, `notes.ts`, permissions as the
  table in this slice says.
- Added after merging the integration branch, both on `customers`: `aftercare.ts` (CRM 13's
  `customer_preference_events`: each switch change, by the customer or the Staff profile, with
  a Staff note in full; the opt-in wording stays on the Aftercare card) and `account.ts`
  (migration 02's *imported* `migrated_customers.imported_at`, migration 12's *signed up*
  `customers.account_linked_at`, migration 05's *Claimed* `claimed_at` and *Welcome-back
  voucher issued* `coupons.created_at` for
  `issued_for = 'welcome_back'`, whose used/expired/open state is a pill because a coupon stores
  no time of use; the code is never shown). New chips: Aftercare, Account.
- `lib/results/owner.ts`: `isCustomersResult`, the one ownership rule. `authorizeResultAccess`
  (`lib/results/access.ts`) now calls it, so the access gate and the timeline cannot drift;
  `resultEmailPattern` is the same rule as a PostgREST `imatch` pattern.
- Route `GET /api/settings/customers/[id]/timeline?before=&kinds=&limit=`: `requireAdmin("customers")`,
  then only the adapters whose permission `getAdminContext().permissions` holds. `kinds` takes
  kind-group keys (`orders,notes`). An `href` is dropped when the viewer lacks
  `permissionForHref(href)`. A failing source is logged and named in `unavailable`; the rest of
  the page stands.
- `app/[lang]/settings/customers/[id]/customer-timeline-card.tsx`: the Timeline card under Order
  History (chips, 50 entries, *Load older*, status pills, links). `customer-detail-client.tsx`
  gains one import and one element; `[id]/page.tsx` is unchanged.
- `lib/crm/notes.ts`: `listCustomerNotes` takes an optional `{ before, limit }` page.
  `lib/reviews/shop-reviews.ts`: `productTitle` is exported.

**Migration.** `20261020113000_admin_audit_log_entity_index.sql`: an index on
`admin_audit_log (entity_type, entity_id, created_at desc)` for the two audit-log reads (Staff
cancel of a Result, Staff marking a visit). Index only. `db-check.sh` applied all migrations;
on 50k seeded rows the planner uses it (seq scan cost 2326 to index scan 6). The `imatch`
pattern was checked in Postgres: a padded, mixed-case email matches; `xmei@…`, `…test.sg` and a
dot-for-any-char do not.

**Tests.**

- `lib/crm/timeline/__tests__/merge.test.ts`: `canonicalAt`; order; stable ties (kind, then
  `ref.id`, then entry id, whatever the input order); duplicates; undated entries dropped;
  empty sources; floors; a randomized paging property (4 sources, tied minutes, limits 7/10/50,
  through the wire encoding: every entry exactly once, in order); termination without repeats
  when a source holds more than a page at one instant; the cursor's wire format.
- `lib/crm/timeline/__tests__/load.test.ts`: skipped adapters are never called, kind filter,
  link stripping, a failing source.
- `lib/results/__tests__/owner.test.ts`: the ownership rule, `authorizeResultAccess` agreeing
  with it case by case (the PRD's "a test pins the two together"), and the `imatch` pattern
  finding exactly the same rows.
- `app/api/settings/customers/__tests__/timeline-route.test.ts`: the fixture Customer (every
  event in order), summaries and links, a Paired build as one entry per fact, no invented dates,
  the containing-email Results of another Customer, roles without `orders`, without `results`
  and with `customers` only, the kind filter, paging through the route, and 401/403/404/400.
  After the merges the fixture also has preference events, a signed-up Migrated customer with
  its Claim and voucher, and another Customer's of each, which never show.
- `lib/supabase/__tests__/fake-admin.ts` (shared test helper) gained `lt`/`lte`/`gt`/`gte`,
  `limit`, `filter(…, "imatch")` and `!inner` embeds with dotted filters. Existing behaviour is
  unchanged: an unaliased embed is read only with `!inner`.

**Deviations, and why.**

- **The adapter returns a batch, not a bare array**: `{ entries, floor }`. A row with several
  dated facts (an order is placed, paid, shipped…), a Paired build folding two rows into one
  entry, and already-shown ties at the cursor all break "the newest `limit` entries" if the
  merge trusts each list blindly. The floor says how far down a source is complete, and the
  merge shows nothing below the highest one, so pages never skip an entry. `readStream` sets it,
  so a simple adapter is still a few lines.
- **The cursor is the last entry's full sort key** (time, kind, ref id, entry id), and adapters
  read *at or before* its time; the merge drops what was shown. Times are compared as canonical
  microsecond UTC strings, because PostgREST trims trailing zeros and two tables' raw strings
  do not sort as text.
- **Email matching ignores surrounding whitespace, in the access gate too.** The criterion asks
  for a guest Result matched "with different case and whitespace", and the PRD asks that the
  timeline never shows a Result the Customer's own login could not open. `access.ts:30-36`
  compared lower-cased emails without trimming, so both now use `isCustomersResult` (trim and
  lower-case). This only widens access to the same address with stray spaces.
- **Results and bookings are read per Customer with a cap of 100** (by id and by email for
  Results), not one stream per column. Their Staff-action entries live in `admin_audit_log`,
  which has no customer column, so the adapter needs the ids; a Paired build needs both halves
  (the other half is read when the window cut the pair). Past 100 Results or bookings created
  before the cursor, the oldest one read is the floor, and an older Result's later steps could
  be missed. No Customer is near that.
- **Paired build dates**: created when its first half was; build sent at the latest
  `assigned_at`, and only once no half is still `held` (the assign route emails the customer only
  then); balance paid at the latest `topup_paid_at`. A Staff cancel of the anchor reads
  "Paired build", of the Mbolster just "Mbolster".
- **Draft Results (`status` null) are left out**, as on the customer's own Results list
  (`app/api/results/route.ts`).
- **Re-adjustments**: *booked* is `created_at` with the current status as the pill; attended,
  no-show and cancelled are dated only by the `readjustment.*` audit entries Staff's actions
  write. A WhatsApp cancel writes none, so it shows only as the pill. A booking has no page of
  its own, so its link opens Appointments.
- **Reviews**: submitted (`created_at`) with the moderation outcome as the pill;
  `product_reviews` stores no moderation time. There is no Admin Panel page for a shop review,
  so the entry has no link.
- **Returns**: *opened* is `rma_requests.created_at`; status changes are the
  `rma_status_events` after the opening one (`from_status` not null), so opening is not shown
  twice.

- **Not added**: migration 07 consent and 08 campaign sends are not on the branch yet.
  Migration 05's `customer_emails` (the per-Customer email ledger: the welcome-voucher
  email now, CRM 07 and 08's aftercare emails later) has no adapter yet. It fits the model as one
  stream like `order_emails`; it is left to CRM 07, the first slice that sends through it for
  the CRM, so its labels and gating are decided once.

**Merges.** `claude/shopify-migration-plan-izv7fo` merged in three times as slices landed:
CRM 13, CRM 14 and migration 05 (conflict: the imports of `customer-detail-client.tsx`; the
Timeline and Aftercare imports both kept), then migration 03 (no conflict), then migration 12
(conflict: the same import block; the Timeline, Account, From Shopify and Aftercare imports all
kept). Every card renders. `[id]/page.tsx` never conflicted and is unchanged by this slice.

**Left for ops or the owner.** Nothing. The integrator refreshes the graph.
