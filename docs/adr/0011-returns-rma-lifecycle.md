# Returns/RMA is an item-level request with an explicit lifecycle

A **Return** (RMA — Return Merchandise Authorization) is a customer-initiated,
**item-level** request against a delivered **Order**, tracked through one
explicit state machine and resolved as a **refund**, **exchange**, or
**replacement**. We model it as its own aggregate (`rma_requests` +
`rma_request_items` + `rma_status_events`) rather than extending the order-level
`refund_request_status` columns (ADR-adjacent, migration `0048`), because a
customer returns *specific items in specific quantities* — not a whole order —
and staff need a per-request audit timeline. Money movement is **not** a new
path: a `refund` resolution routes entirely through the existing
`refundPayment` + `charge.refunded` money-ledger webhook (ADR 0002 authorize/
capture posture unchanged).

## Model

- **`rma_requests`** — one per customer submission: `order_id`, `customer_id`,
  `resolution` (`refund | exchange | replacement`), `status`, `reason`,
  `customer_note`, `photo_urls text[]`, resolution tracking fields, timestamps.
- **`rma_request_items`** — the returned lines: `rma_request_id`, `order_item_id`,
  `quantity`. Eligibility caps quantity at the ordered quantity minus quantity
  already tied up in a non-terminal RMA for that line.
- **`rma_status_events`** — append-only timeline: `rma_request_id`, `from_status`,
  `to_status`, `actor` (`customer | staff | system`), `reason`, `created_at`.
  This is the source of truth for the request's history; `rma_requests.status`
  is a denormalized cache of the latest event's `to_status`.
- **`rma_emails`** — idempotency ledger mirroring `order_emails`, but keyed
  **`(rma_request_id, template)`** — NOT `(order_id, template)`. One order can
  have several RMAs, each sending its own lifecycle emails.

## State machine

```
requested ──▶ approved ──▶ instructions_sent ──▶ received ──▶ completed
    │            │                 │                  └──────▶ refunded
    ├──▶ rejected│                 │
    └──▶ cancelled ◀───────────────┘   (cancellable until received)
```

- `requested → approved | rejected | cancelled`
- `approved → instructions_sent | cancelled`
- `instructions_sent → received | cancelled`
- `received → completed | refunded`
- **Terminal:** `completed`, `refunded`, `rejected`, `cancelled`.

`canTransition(from, to)` is a pure function (no I/O); every server mutation
validates through it before appending a status event, so an illegal transition
(e.g. approving a `rejected` RMA) is refused server-side, not just hidden in UI.

## Resolution → outcome

| Resolution   | On `received`                                                              | Terminal   |
|--------------|---------------------------------------------------------------------------|------------|
| `refund`     | Call existing `refundPayment` + money-ledger webhook. **No new refund path.** | `refunded` |
| `exchange`   | Capture outbound tracking/reference; ship replacement of same item.       | `completed` |
| `replacement`| Capture outbound tracking/reference; ship corrected/like item.            | `completed` |

The RMA reaches `refunded` only when the Stripe `charge.refunded` webhook
settles — the same seam admin refunds already use. `refunded` is therefore
webhook-driven; `completed` is a staff action once tracking is captured.

## Eligibility (pure inputs)

`evaluateEligibility(order, orderItem, existingRmaQty, settings, now)` returns
`{ eligible, reason? }` from data only (no I/O), so both the customer UI and the
server insert share one rule set:

- Order belongs to the requesting customer (enforced again by RLS + server).
- Order is **delivered** (`orders.delivered_at` is set); the window is measured
  from `delivered_at`.
- `now` is within `site_settings.rma_return_window_days` (default **30**) of
  `delivered_at`.
- Requested quantity ≤ ordered quantity − quantity already in a non-terminal RMA
  for that line.
- Order is not already fully refunded.

## Consequences

- **Attachments** are customer-supplied `photo_urls text[]` on the request
  (URLs, uploaded via the existing media/upload path). No new blob store; no
  per-item photos in v1. `// ponytail:` per-item photos only if support asks.
- **RLS** follows the `current_customer_id()` SECURITY DEFINER pattern (migrations
  0039/0040): customers `select`/`insert` only their own RMAs; all staff writes
  go through the service role, never customer RLS.
- **Permissions**: the admin RMA surface reuses the existing `orders` permission
  (RBAC #36) — no new permission is minted.
- **Audit**: every staff mutation calls `recordAdminAction` (#38) with
  before/after, in addition to the `rma_status_events` row (customer-visible
  timeline vs. staff audit log are distinct on purpose).
- The order-level `refund_request_status` flow (migration 0048, Result customised
  orders) is **left untouched**; RMA is the general item-level path. They may
  coexist; RMA does not migrate or replace it.

## Considered options

- **Extend order-level `refund_request_status` columns** — rejected: cannot
  express per-item quantities, multiple concurrent returns, or a resolution type
  beyond refund; no per-request timeline.
- **A single `rma` table with items as JSON** — rejected: loses referential
  integrity to `order_items`, makes the "quantity already returned" eligibility
  check and per-line reporting awkward.
- **A new money path for RMA refunds** — rejected: duplicates settlement logic
  and risks double-refunds; reusing `refundPayment` + the money-ledger webhook
  keeps one source of truth for money movement.
