# Finance reports: vertical slices (issues)

Tracer-bullet breakdown of the PRD (`../finance-reports-prd.md`). Each slice is a thin, demoable
path through all layers.

- **Triage label:** `needs-triage` (slices 02 and 05)

## Slices

| # | Title | Type | Status | Blocked by | User stories |
|---|-------|------|--------|------------|--------------|
| [01](01-customer-purchases-report.md) | Customer purchases report: build, download, email to chosen recipients | AFK | **built** | none | 1–9 |
| [02](02-stripe-fees-and-payouts.md) | Stripe fees and payouts: what reached the bank, payout by payout | AFK | not started | 01 | 10 |
| [03](03-supplier-costs-from-apis.md) | Supplier costs from the APIs that report money (Easyship, WhatsApp, Vercel) | AFK | **won't build**: replaced by a Claude scheduled task (PRD "Supplier invoices") | 01 | 11 |
| [04](04-billing-mailbox-invoices.md) | Supplier invoices from a billing mailbox (Anthropic, Google Workspace, Vercel, Supabase, Resend, Stripe GST) | AFK + HITL (mailbox, Google consent) | **won't build**: replaced by a Claude scheduled task (PRD "Supplier invoices") | 01 | 11 |
| [05](05-monthly-send.md) | Last month's reports sent on the 1st | AFK | not started | 01 | 12 |
