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
  - "app/api/shop/orders/*/refund/**"
  - "app/api/shop/orders/*/refund-request/**"
  - "app/api/shop/orders/*/cancel/**"
  - "app/api/account/orders/*/refund-request/**"
  - "app/api/account/orders/*/rma/**"
  - "app/*/settings/orders/*/refund-dialog.tsx"
  - "app/*/account/orders/*/refund-actions.tsx"
  - "app/*/settings/rma/actions.ts"
  - "lib/ecommerce/admin-refund.ts"
  - "lib/results/post-delivery-refund.ts"
  - "app/*/settings/orders/*/payment-link-card.tsx"
  - "app/api/results/*/request-payment/**"
  - "lib/email/payment-request.ts"
  - "app/api/readjustments/checkout/**"
  - "lib/readjustment/checkout.ts"
  - "lib/readjustment/refund.ts"
  - "app/api/results/hold/**"
  - "app/api/results/*/accept/**"
  - "app/api/results/*/cancel/**"
  - "app/api/results/*/decline/**"
  - "lib/results/paired-hold.ts"
  - "lib/results/pair-ending.ts"
  - "lib/ecommerce/discounts.ts"
  - "lib/ecommerce/coupon-math.ts"
  - "lib/ecommerce/admin/coupons.ts"
  - "lib/checkout-code/**"
  - "lib/results/discount.ts"
  - "app/api/shop/coupons/**"
  - "app/api/settings/discounts/**"
  - "app/*/settings/discounts/**"
  - "lib/ecommerce/money-ledger.ts"
  - "lib/ecommerce/order-stock.ts"
  - "lib/ecommerce/tax.ts"
  - "lib/ecommerce/exchange-rates.ts"
  - "lib/ecommerce/shipping.ts"
  - "lib/shop/price-sync.ts"
  - "lib/shop/customization-price.ts"
  - "lib/ecommerce/shop-card-price.ts"
  - "app/api/shop/products/resync-prices/**"
  - "app/api/shop/products/*/variants/**"
  - "app/*/settings/costings/**"
  - "lib/points/**"
  - "app/api/shop/points/**"
  - "app/api/shop/customers/*/points/**"
  - "lib/commissions/**"
  - "lib/milestones/**"
  - "lib/referrals/**"
  - "lib/payout-upload/**"
  - "lib/partner-self-purchase/**"
  - "app/*/settings/partner-commissions/**"
  - "components/partner/commission-choice-*"
  - "components/partner/payout-summary.tsx"
  - "app/api/partner/payment-details/**"
  - "app/*/partner/settings/**"
---

# Money paths

This code takes, holds, prices, discounts or refunds money, or pays partners.

The `paths:` list above is also what `scripts/pr-risk.mjs` reads to keep a
pull request from merging itself (`.github/workflows/auto-merge.yml`). Each
line is one quoted pattern of plain path segments, `*` within a segment and
`**` as a whole segment; a line it cannot read stops every auto-merge.

- Costings is the single source of sell price. Storefront prices are projected
  from it, never typed in.
- Read `docs/data-flows/purchases-to-inventory.md` before changing how a
  payment becomes an order and takes stock.
- A change here gets a second, independent check before the owner merges:
  run the `reviewer` subagent on the diff, and say in the pull request that it
  touches money.
- Exercise Stripe in test mode. Live-mode runs are blocked for Claude.
