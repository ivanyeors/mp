---
paths:
  - "lib/stripe/**"
  - "app/api/stripe/**"
  - "app/api/checkout/**"
  - "app/api/pay/**"
  - "app/api/shop/checkout/**"
  - "app/*/shop/checkout/**"
  - "app/*/pay/**"
  - "app/api/staff-orders/**"
  - "lib/staff-orders/**"
  - "lib/authorization-hold/**"
  - "lib/payment-reminders/**"
  - "lib/result-pricing/**"
  - "lib/pricing/**"
  - "lib/costings/**"
  - "lib/rma/**"
---

# Money paths

This code takes, holds, prices or refunds money.

- Costings is the single source of sell price. Storefront prices are projected
  from it, never typed in.
- Read `docs/data-flows/purchases-to-inventory.md` before changing how a
  payment becomes an order and takes stock.
- A change here gets a second, independent check before the owner merges:
  run the `reviewer` subagent on the diff, and say in the pull request that it
  touches money.
- Exercise Stripe in test mode. Live-mode runs are blocked for Claude.
