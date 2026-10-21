# 03 — Earning: points written when an Order's return window closes

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** 02
**User stories:** 1, 2, 6
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:checkout`, `area:results`

## Goal

Every Order paid after launch earns `floor(rate × base)` points, written once, 30 days after
delivery, on the cash the customer kept (rules c–e, l). Shop, Result and paid Re-adjustment
Orders all earn. Nothing in the Results money path changes, except that Accept now names the
Customer.

## Scope

**Every Order has a Customer.** Accept inserts the Order with the Result's `customer_id`
(`app/api/results/[id]/accept/route.ts:474`), which can be null.

- When it is null and `customer_email` is a real address, Accept resolves the Customer with
  `findOrCreateCustomer` (`lib/ecommerce/customers.ts:15`), as shop checkout does.
- It does nothing for the `unknown@example.com` fallback (`:473`).

**The release runner.** `runPointsEarn` joins the daily job (chained onto `results-sla`, as
`lib/aftercare/job.ts` is; there is no third cron). One SQL function,
`release_earned_points(p_now)`, inserts an `earn` entry for each Order that:

- was paid on or after `points_launch_at`, while `points_enabled`;
- is not `cancelled` or `payment_failed`;
- had its window close: `delivered_at + 30 days ≤ now`, or `paid_at + 30 days` for an Order
  with service lines only;
- has `base > 0` and no `earn` entry.

It uses `on conflict do nothing` on `points_ledger_one_per_order`, so a re-run writes nothing.
The window is `DEFAULT_RETURN_WINDOW_DAYS` (`lib/rma/eligibility.ts:7`), not a second constant.

**Clawback.** In `charge.refunded` (`app/api/stripe/webhook/route.ts:512-634`), after the
rollup:

- if the Order already has an `earn` entry, insert a `clawback` keyed on the refund id;
- take `min(floor(rate × refund amount), the Order's net earned, available balance)`;
- record any shortfall in the entry's note.

A refund before release needs nothing, because the base subtracts `amount_refunded`.

**What the customer sees.**

- **Order detail** (`app/[lang]/account/orders/[orderNumber]/page.tsx`):
  - "Earns N points (S$x), usable from <date>" while pending;
  - "Earned N points" once written;
  - "Points not earned: refunded" when the base reaches 0.
- **Order confirmation email:** "This order will earn N points (S$x) once it has been delivered
  and kept for 30 days." For a guest, add: "Sign in with this email to see and use them."

## Acceptance criteria

- [ ] **The pure rule.** A vitest table for `pointsForOrder({ subtotal, discount, refunded })`
      covers:
      - rounding down;
      - a points-paid Order earning on its cash only;
      - a fully refunded Order earning 0;
      - a service-only Order.
- [ ] **Release.** A SQL assert covers:
      - an Order inside its window earns nothing yet;
      - the day after, it earns once;
      - a second run writes nothing;
      - a cancelled Order, and one paid before launch, never earn.
- [ ] **Clawback.**
      - A refund after release claws back once per refund id, never below zero.
      - A replayed webhook writes nothing.
- [ ] **Guests.** A guest Result accepted with an email belongs to a Customer, and that
      Customer's balance shows the points after sign-in.
- [ ] **Unchanged.** Every existing Accept, commission and webhook test passes.
- [ ] `./scripts/graphify update .` is run in the same commit.
