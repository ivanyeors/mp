# Slice 04 — Supplier invoices from a billing mailbox

> **Won't build (2026-10-22).** The owner chose a Claude scheduled task that reads the
> `sg@mpillow.com` mailbox through the Gmail connector instead of app code. See the PRD section
> "Supplier invoices". The research below is kept for reference.

Type: AFK + HITL (set up the mailbox; Google consent)
Parent: PRD `finance-reports` (`../finance-reports-prd.md`)
User stories covered: 11
Blocked by: 01; PRD open question 1 (which mailbox)

## Why

Most suppliers have no invoice API: Anthropic (Console receipts and Pro/Max/Team subscriptions —
how Claude Code seats are paid), Google Workspace, Vercel, Supabase, Resend, and Stripe's own GST
invoice. All of them email the invoice or receipt. One mailbox that receives every one of those emails
is the only source that covers them all.

## What to build

- **HITL:** create `billing@mpillow.com` (a Google Group or user) and point each supplier's billing email at it:
  Vercel Settings → Billing → Invoice Email Recipient; Anthropic billing email (Team: via Support);
  Google Workspace billing contacts; Supabase org billing email; Resend; Stripe tax invoice recipients.
- A daily job reads that mailbox with the Gmail API, `gmail.readonly`, through an OAuth refresh token
  for that one mailbox — not domain-wide delegation, which would grant read on every mailbox in the domain.
  The app's existing Gmail service account only holds `gmail.send` and stays that way.
- One parser per supplier, keyed on sender and subject (e.g. `subject:"Your receipt from Anthropic"`),
  extracting invoice number, date, amount, currency and tax from the body; the PDF stored in the private
  `media` bucket. Writes the same `supplier_charges` table as slice 03, source `email`.
- An email that matches a supplier but fails to parse is listed for Staff to type in, never dropped.
- A manual entry form (number, date, amount, currency, GST, PDF) for anything that arrives another way.

## Acceptance criteria

- [ ] Each supported supplier's last three real invoices parse to the right number, date, amount and currency.
- [ ] USD invoices keep their USD amount: the card statement prints it, and that is what is matched.
- [ ] Re-reading the mailbox adds nothing twice (unique on supplier + invoice number).
- [ ] An unparsed match appears on the report as "needs entry".

## Open

Sender addresses and subject lines for Vercel, Google Workspace, Supabase and Resend need confirming
from real emails before the parsers are written.
