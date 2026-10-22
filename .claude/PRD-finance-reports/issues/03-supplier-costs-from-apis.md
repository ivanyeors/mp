# Slice 03 — Supplier costs from the APIs that report money

> **Won't build (2026-10-22).** The owner chose a Claude scheduled task that reads the
> `sg@mpillow.com` mailbox through the Gmail connector instead of app code. See the PRD section
> "Supplier invoices". The research below is kept for reference.

Type: AFK
Parent: PRD `finance-reports` (`../finance-reports-prd.md`)
User stories covered: 11
Blocked by: 01

## What to build

A "Supplier costs" report with one section per supplier whose API reports money. Fetched by a daily
job into a `supplier_charges` table (supplier, document type, number, issued, period, amount, currency,
tax, source id unique), so the report stays DB-only and history survives each API's lookback limit.

| Supplier | Endpoint | Auth | Gives |
|---|---|---|---|
| Easyship | `GET /2024-09/billing_documents?from_date&to_date` (+ `/{id}/download` PDF), `GET /2024-09/transaction_records` | Bearer, scopes `public.billing_document:read`, `public.transaction_record:read` | **Real invoices and credit notes** (weekly), and per-shipment charges incl. weight adjustments posted up to 90 days later. Paging: `count` is null, page until empty |
| Meta WhatsApp | `GET /{WABA_ID}?fields=pricing_analytics.start().end().granularity(DAILY).metric_types(["COST","VOLUME"]).dimensions(["PRICING_CATEGORY"])`; currency from `?fields=currency` | System-user token, `whatsapp_business_management` | **Approximate** cost per day and category. Lookback 1 year, so store it. Card receipts go through slice 04 |
| Vercel | `GET https://api.vercel.com/v1/billing/charges?from&to&teamId` | Bearer token of a team Owner/Member/Billing | Daily FOCUS 1.3 rows in USD (`BilledCost`, `ServiceName`). A breakdown, not the invoice: Pro bills the seat up front plus last cycle's overage, so days do not sum to an invoice |

Not built on (see the PRD table): Anthropic `cost_report` (daily USD usage; prepaid orgs are charged
for credit purchases, so it never matches a card line), Google Workspace (licence counts only),
Supabase (no documented billing endpoint), Resend (counts only), Google Cloud (BigQuery export only).

## Acceptance criteria

- [ ] Easyship invoices in the period, each with number, date, amount, currency and a link to its PDF.
- [ ] WhatsApp and Vercel shown as "estimated from usage", never as an invoice.
- [ ] Re-running the job adds nothing twice (unique on supplier + source id).
- [ ] A supplier whose credentials are missing is listed as "not connected", not as zero.

## Sources

- https://developers.easyship.com/reference/billing_documents_index
- https://developers.easyship.com/reference/transactions_index
- https://developers.facebook.com/documentation/business-messaging/whatsapp/analytics/
- https://vercel.com/docs/rest-api/billing/list-focus-billing-charges
- https://platform.claude.com/docs/en/manage-claude/usage-cost-api
