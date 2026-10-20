# PRD — Email marketing (placeholder)

**Status:** placeholder, not yet specified. The owner plans this for later (owner, 2026-10-19).
**Why it exists now:** two plans hand work to it, and they need one named place to point at:
`PRD-shopify-customer-migration` and `PRD-customer-crm`. This page records what it inherits and
the rules it must keep, so nothing built before it has to be rebuilt.

Write the real PRD here when the work starts. Replace this page; do not add a second one.

## What it inherits

None of the items below is built yet. Each is planned in the slice named.

| Piece | Planned in | What it gives this initiative |
|---|---|---|
| **Marketing consent** with provenance (`customers.marketing_email`, `customer_consent_events`) | migration slice 07 | who may be emailed, why, and since when |
| One-click unsubscribe (RFC 8058) and the footer link | migration slice 07 | the legal minimum for every campaign |
| The campaign transport: Resend on its own subdomain, never the Gmail mailbox that sends order emails | migration slices 08–09 | deliverability that cannot hurt order mail |
| The send ledger `customer_campaign_sends`, with bounce and complaint handling | migration slice 08 | no double sends; suppression |
| Audience rules in `lib/` (`selectCampaignAudience`) | migration slice 08 | sending rules that are not tied to a script |
| **Segments** (saved Customer filters) and `resolveSegment` | CRM slice 05 | the audiences a campaign is sent to: `resolveSegment`, narrowed by consent and suppression |
| The **Customer timeline** | CRM slice 03 | every send shows on the Customer's history |

## Likely scope (to be decided when specified)

- **A Campaigns page in the Admin Panel.** Pick a template and a **Segment**, see the eligible
  count after consent and suppression, send a test, then send in waves or schedule it.
- **First-party sign-up**, such as a newsletter form on the site, with double opt-in. Today the
  only consent capture planned is the Profile toggle (migration slice 07).
- **Templates and copy** beyond the three migration emails.
- **Reporting** per campaign: sent, bounced, complained, clicked, unsubscribed, and the revenue
  on attributed **Orders**.

## Rules it must keep

These are already decided upstream; changing one means changing that plan too.

- **Consent only.** Only `subscribed` Customers receive marketing. `unsubscribed` is never
  selected, and nothing but the customer's own action re-subscribes them.
- **Never the transactional mailbox.** Campaign mail never uses the Gmail transport.
- **Ledger first.** A row is written before every send, unique per Customer and campaign.
  Widen the `customer_campaign_sends.template` check to a campaign key; do not build a second
  ledger.
- **Care reminders are not marketing.** The CRM's service reminders stay there, under their
  own rules. These are the free re-adjustment reminder and the periodic check-up, which the
  owner decided on 2026-10-20 is a service message (CRM slices 07–08). This initiative does not
  send them. A reminder that gains an offer becomes this initiative's.
- **Email only.** No WhatsApp or SMS marketing (Do Not Call Registry duties in Singapore).
