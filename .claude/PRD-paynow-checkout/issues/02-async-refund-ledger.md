# 02 — Handle `refund.updated`, so an async refund reaches the money ledger

**Type:** AFK
**Blocked by:** none (ships first; independent of the rest)
**User stories:** 11, 12
**Labels:** `bug`, `needs-triage`, `P1`, `area:checkout`, `area:admin`

## Goal

Close a live correctness gap that PayNow turns from theoretical into certain: a
refund that completes asynchronously is **never recorded**.

## The gap, precisely

`lib/stripe/refunds.ts` records nothing by design — its docstring delegates the
ledger row to "the `charge.refunded` / `refund.*` webhook". Callers that rely on
that: `app/api/shop/orders/[id]/cancel/route.ts:48`,
`app/api/shop/orders/[id]/refund-request/route.ts:103`,
`app/api/shop/orders/[id]/refund/route.ts:90`,
`app/[lang]/settings/rma/actions.ts:170`.

For a card, `charge.refunded` arrives with the refund already `succeeded`, the
handler's `r.status === "succeeded"` filter passes, and the ledger row is written.

For PayNow:

| Step | Event | What the code does |
|---|---|---|
| Refund created, `pending` | `charge.refunded` | filter drops it — **correctly**, money has not moved |
| Refund succeeds | **`refund.updated`** | **not handled anywhere** |
| Refund fails | `refund.failed` | handled correctly (line ~746) |

So the success path is silent and the failure path is sound — the worse way round.
Money leaves the account, the money ledger never learns, and margins over-report
forever.

## Scope

Add a `refund.updated` case to `app/api/stripe/webhook/route.ts`, taking the
endpoint from 9 events to 10.

- On `status === "succeeded"`: write the signed ledger row via `recordLedgerEntry`,
  idempotent on `refund.id` — the same idempotency the `charge.refunded` path
  already relies on, so a card refund that *also* emits `refund.updated` records
  once, not twice. **This is the load-bearing detail of the slice.**
- Then `rollupOrderMoney` and an `addOrderTimelineEvent`, mirroring `refund.failed`.
- On `status === "failed"`: do nothing. `refund.failed` owns it; handling both
  double-posts the compensating adjustment.
- On `pending` / `requires_action`: do nothing, but add a timeline event on first
  sight so Staff can see a refund is in flight rather than lost.
- Resolve the order the same way `refund.failed` does (`payment_intent` →
  `orders.payment_reference`), and dead-letter via `recordWebhookFailure` when no
  order matches, so a **Result** top-up refund is visible rather than dropped.

Also fix the docstring in `lib/stripe/refunds.ts`: `refund.*` is no longer
aspirational.

## Acceptance criteria

- [x] `refund.updated` with `succeeded` writes exactly one ledger row and rolls up.
- [x] Re-delivery of the same event writes nothing further (idempotent on refund id).
- [x] A **card** refund emitting both `charge.refunded` and `refund.updated` records
      **one** row — verified by a test, since this is the regression the slice risks.
- [x] `refund.updated` with `failed` is a no-op; `refund.failed` still posts the
      reversal exactly once.
- [ ] A `pending` refund appears on the order timeline.
- [ ] An unmatched refund dead-letters rather than vanishing.
- [x] Webhook endpoint subscribed to `refund.updated` — **manual Dashboard step** on
      `we_1UEpVxCMlMx7bA76xFJYdCCj`, host `custom.mpillow.com`.

## Notes

Ship this **before** PayNow carries any volume. It is the only slice here that
fixes something already broken, and it is not PayNow-specific — it is async refunds
generally, of which PayNow is simply the first.

## Built (2026-11-22)

`refund.updated` with `succeeded` runs the same code as `charge.refunded`
(`settleSucceededRefunds` in `app/api/stripe/webhook/route.ts`): ledger row,
rollup, RMA settle, points clawback, full-refund side effects and the refund
email, all once per refund id. It first re-reads the refund from Stripe and
trusts that status, not the event's: a retried "succeeded" event that lands
after `refund.failed` would otherwise record a refund that never happened.
Test: `app/api/stripe/webhook/__tests__/async-refund.test.ts`.

Deliberately not built:

- **A timeline event for a pending refund.** The Order refund, refund-request
  and RMA paths already note the refund on the Order when they create it (the
  Order cancel writes `cancel_initiated`). A refund made in the Stripe Dashboard
  is not noted until it settles.
- **Dead-lettering an unmatched refund.** It does what `charge.refunded` does:
  records nothing. Nothing reads `stripe_webhook_failures`, so a dead-letter row
  would tell no one. The one real case, a Balance payment refunded before
  Accept, is in `docs/known-issues.md`.

Live endpoint `we_1UEpVxCMlMx7bA76xFJYdCCj` subscribed to `refund.updated` on
2026-11-23 (11 events). The sandbox account `acct_1UEocJFmfnDU9wZa` was not
reachable from that session; subscribe its endpoint too before testing a pending
refund in test mode.
