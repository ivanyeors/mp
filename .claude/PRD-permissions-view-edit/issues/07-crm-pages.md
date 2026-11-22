# Slice 07 — CRM: Results, Orders, Returns, Campaigns + Send, Email templates

Type: AFK
Parent: PRD `permissions-view-edit`
Triage: blocked by 04. Refund paths are slice 12 (owner decision 5).
Status: todo
User stories covered: 6, 7
Owner review: **money**. RMA actions, payment links, holds and staff orders are money paths, so it needs the `reviewer` subagent.

## What to build

Apply the page-slice rule (`issues/README.md`) to:

| Page | Writes move to | Notes |
|---|---|---|
| Results | `results-edit` | `/api/results/*` writes (accept, cancel, decline, hold, request-payment, assign…); `/api/results/[id]/customer` POST stays `customers-edit` and gains `results-edit` |
| Orders | `orders-edit` | `orders/actions.ts` (`updateOrderStatus`, `fulfillOrder`), `/api/staff-orders`, payment link card. Refund paths are slice 12, not this one. |
| Returns / RMA | `returns-edit` | `rma/actions.ts`: approve, reject, instructions, receive, complete, note. `issueRmaRefund` is slice 12. |
| Email campaigns | `campaigns-edit`; Send → `campaigns-send` | `campaigns/actions.ts`. The send action takes `campaigns-send`; drafting takes `campaigns-edit`. Funnel arrange keeps `customers-edit` as well. |
| Email templates | `email-templates-edit` | save, reset, test send |

Customers is already split (ADR 0028). Its folders join the `page-write-guard.test.ts` table, replacing `customers-write-guard.test.ts` once they are covered.

## Acceptance criteria

- [ ] `page-write-guard.test.ts` gains these folders, shown failing before and passing after.
- [ ] Route-gate tests:
  - Orders View-only gets 403 on fulfil. Refund is covered in slice 12.
  - `page-write-guard.test.ts` leaves the four refund paths to `refund-guard.test.ts` (slice 12), so the two tests never disagree.
  - Campaigns Edit without Send can save a draft but gets 403 on send.
- [ ] Read-only render tests: Order detail, RMA detail and the Campaign editor (no Send button without `campaigns-send`).
- [ ] Preview screenshots as a View-only role.
- [ ] `reviewer` subagent verdict recorded.

## Blocked by

- Slice 04.
