# Slice 02 — Stripe fees and payouts: what reached the bank, payout by payout

Type: AFK
Parent: PRD `finance-reports` (`../finance-reports-prd.md`)
User stories covered: 10
Blocked by: 01

## Why

The bank statement shows Stripe payouts, not orders. Slice 01 lists what customers paid; this slice
shows how those payments, minus refunds and Stripe's fees, became each deposit.

## What to build

- A "Stripe payouts" report on Analytics → Reports, same period, CSV and send flow as slice 01.
- Payouts arriving in the period: `GET /v1/payouts?arrival_date[gte]&arrival_date[lt]` — `id`, `amount`,
  `currency`, `arrival_date`, `status`, `trace_id` (the bank's reference), `reconciliation_status`.
- Each payout's contents: `GET /v1/balance_transactions?payout=po_…&expand[]=data.source` — `amount`,
  `fee`, `fee_details[]` (`type` `stripe_fee` / `tax` = GST on the fee / …), `net`, `reporting_category`.
  Map charges back to Orders through `orders.payment_reference` (the PaymentIntent).
- Only payouts with `reconciliation_status = completed`; list the others as pending.
- Fees billed outside a sale (Stripe Tax, Radar, dispute fees) appear as their own balance transactions
  with `reporting_category = fee`; show them as fee rows.
- This is a live Stripe read, unlike slice 01. Keep it on the Reports page only (ADR 0006 keeps Analytics
  charts DB-only), behind the same `analytics` key, paged and time-limited.

## Not available by API

Stripe's monthly **GST tax invoice for its fees** (Singapore) is Dashboard-only (Settings → Documents,
by the 10th of the next month). Slice 04 picks it up from the billing mailbox, or the accountants download it.

## Acceptance criteria

- [ ] Each payout row's net equals the sum of its balance transactions' net, and its amount the bank deposit.
- [ ] Every charge in a payout names its Order number, or says it has none.
- [ ] GST on Stripe fees is its own column.
- [ ] Uses a restricted key with Balance and Payouts read if one is configured; the secret key otherwise.

## Sources

- https://docs.stripe.com/api/balance_transactions/list
- https://docs.stripe.com/reports/payout-reconciliation
- https://docs.stripe.com/reports/report-types/fees
- https://support.stripe.com/questions/taxes-on-stripe-fees-for-singapore-based-businesses
