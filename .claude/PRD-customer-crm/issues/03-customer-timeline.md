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

- [ ] vitest covers `mergeTimeline`: order, stable ties, the cursor across pages, and empty
      sources.
- [ ] A fixture Customer with an order, a guest Result matched by email (with different case
      and whitespace), a booking, a return and a note shows every event in order.
- [ ] A role without `orders` sees no order or order-email entries. A role without `results`
      sees no Result entries. This is tested at the route.
- [ ] A Result belonging to a different Customer, whose email merely contains this one's, is
      never shown.
- [ ] `./scripts/graphify update .` is run in the same commit.
