# Slice 01 — Customer purchases report: build, download, email to chosen recipients

Type: AFK
Status: built
Parent: PRD `finance-reports` (`../finance-reports-prd.md`)
User stories covered: 1–9

## What was built

- `lib/finance-reports/period.ts`: report periods as Singapore days.
- `lib/finance-reports/customer-purchases.ts` (pure) and `load-customer-purchases.ts` (DB): sales by
  `paid_at`, refunds, lost disputes and refund reversals from `order_payments` by `created_at`, and the
  Shopify order mirror's paid orders and refunds. One CSV, Amount column sums to the net.
- `lib/finance-reports/send.ts`: recipients (validated, de-duplicated, at most 20), one email each with
  the CSV attached and Reply-To the sender, audit row `finance_report.send`, recent sends.
- `lib/email/finance-report.ts` (`ops.finance_report`) and text attachments on `OutgoingEmail` (Resend, Gmail).
- Permission `analytics-reports` ("Finance reports: send by email"), requires `analytics`.
- Page `/settings/analytics/reports`, linked from the Analytics header: period with Last month / This
  month, totals per currency, the first 200 rows, Download CSV, Members checklist plus typed addresses,
  optional message, Send, Recently sent.

## Acceptance criteria

- [x] A sale paid 07:00 SGT on the 1st is in that month; one paid 00:30 SGT on the 1st of the next is not.
- [x] A November refund of an October sale is in November's report, negative.
- [x] The CSV's Amount column sums to the report's net.
- [x] A customer name starting with `=`, `+`, `-` or `@` is written as text.
- [x] Each recipient gets their own email; one failing address does not stop the rest; the failure is shown and audited.
- [x] A role without `analytics-reports` sees reports but cannot send them, and the page says how to get it.
- [x] The send rebuilds the report on the server from the period; the browser never supplies rows.

## Sign-off (HITL)

- [ ] Send last month's report to yourself through the production transport and open the CSV in Excel and Google Sheets.
- [ ] Tick a handful of rows against the Stripe dashboard (amount, date, PaymentIntent).
- [ ] Give "Finance reports: send by email" to any custom role that should have it (Users & permissions → Roles).
