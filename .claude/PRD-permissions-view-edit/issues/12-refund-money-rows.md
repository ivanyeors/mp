# Slice 12 — Refund money: its own row under Orders and Returns

Type: AFK
Parent: PRD `permissions-view-edit`
Triage: ready (owner decision 5, 2026-11-22)
Status: todo
User stories covered: 12, 13
Owner review: **money**. Refund routes, `rma/actions.ts` and the refund dialog are in `.claude/rules/money.md`, so it needs the `reviewer` subagent's second check, and the owner merges.

## What to build

Sending money back to a customer becomes its own edit-only row, **Refund money**, under Orders (`orders-refund`, requires `orders-edit`) and under Returns (`returns-refund`, requires `returns-edit`). The keys and the day-one grant land in slices 01 and 02. This slice moves every staff refund path onto them.

Every staff refund goes through `refundPayment` (`lib/stripe/refunds.ts:12`). Re-grep before building (`grep -rln "refundPayment\|stripe.refunds" app lib`) in case a path was added.

| Path | Today | After |
|---|---|---|
| `POST /api/shop/orders/[id]/refund` (Order refund dialog, `orders/[id]/refund-dialog.tsx`) | `requireAdmin("orders")` (`route.ts:90`) | `requireAdmin("orders-refund")` |
| `POST /api/shop/orders/[id]/refund-request` | `requireAdmin("orders")` (`route.ts:27`) | `approve` (calls `refundPayment`, `:72`) → `orders-refund`; `reject` (returns before any refund) → `orders-edit` |
| `POST /api/shop/orders/[id]/cancel` | `requireAdmin("orders")` (`route.ts:16`) | When `isPaidOrder(order)` (it refunds, `:49`) → `orders-refund`; otherwise `orders-edit` |
| `issueRmaRefund` (`app/[lang]/settings/rma/actions.ts:104`) | `assertAdmin("returns")` (`:105`) | `assertAdmin("returns-refund")` |

Not staff paths, so unchanged and listed as named exceptions in the test:
- the customer's `/api/account/orders/[orderNumber]/refund-request` and `cancel`;
- the Stripe webhook.

Releasing an authorization hold (Result cancel or decline) takes no money back and stays with Edit.

**UI.** The server pages pass `canRefund`. Without it, Order detail hides "Refund" and "Approve refund", and shows "Cancel order" only for unpaid orders; RMA detail hides "Issue refund". Reject and the rest of the processing stay with Edit.

**Test.** `lib/auth/__tests__/refund-guard.test.ts` (AST, modelled on `customers-write-guard.test.ts`):
- Every module under `app/` that imports `refundPayment` must guard each exported route or `"use server"` action that reaches it with a key whose `requires` closure includes `orders-refund` or `returns-refund`.
- A branch that refunds and one that doesn't may guard differently, but the refunding branch must hold the refund key.
- Named exceptions: `app/api/account/**` (the customer's own request) and `app/api/stripe/webhook` (Stripe-initiated), each with its reason.

## Acceptance criteria

- [ ] `refund-guard.test.ts` shown failing on the old code (all four paths listed as guarded by `orders` / `returns` only) and passing after.
- [ ] Route tests for a role with `orders-edit` and no `orders-refund`:
  - 403 on refund, on refund-request approve, and on cancel of a paid order;
  - served on refund-request reject and on cancel of an unpaid order.
- [ ] Route test: `issueRmaRefund` throws "Forbidden" for a role with `returns-edit` and no `returns-refund`.
- [ ] Render tests: with `canRefund={false}`, Order detail and RMA detail have no refund buttons.
- [ ] Before merging: confirm slice 02 is applied in production and every live role that holds `orders` or `returns` holds the refund key. Paste the query in the pull request.
- [ ] Preview screenshots of Order detail and RMA detail as a role with Edit but no Refund money.
- [ ] `reviewer` subagent verdict recorded.

## Blocked by

- Slice 01 (keys) and slice 02 applied in production (the day-one grant). Without 02, roles would lose refunding.
