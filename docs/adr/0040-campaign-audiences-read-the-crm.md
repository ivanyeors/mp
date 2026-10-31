# Campaign audiences read the CRM, and one claim rule decides who receives

Status: Accepted (PRD `campaign-audiences`, owner decisions 2026-10-31). Supersedes
`PRD-crm-retention-loop` decision 6 (*Playbooks are campaigns, not automation*) for campaigns set
to **Kept sending**. Builds on [ADR 0028](0028-customer-crm.md) (the CRM reads the facts the
platform already records) and [ADR 0039](0039-marketing-consent-by-default.md) (consent by
default).

## Context

The Customers list can describe a group of people (by **Lifecycle stage**, what they bought,
when, where), and a filter can be saved as a **Segment**. **Email campaigns** can send to a
Segment. The plan joins the two so the right email reaches the right people, and adds the rules a
store sending several campaigns needs: spacing one person's emails, leaving groups out, sending as
people arrive in a stage, and knowing what each campaign did.

Each of those could grow its own idea of who may be emailed: a list kept by email marketing, an
"engaged" flag beside consent, a scheduler that sends outside the claim. Two meanings of "may we
email them" is how a store emails someone who unsubscribed. This record keeps one.

## Decision

- **(1) Consent stays one rule in SQL.** `marketing_campaign_blocker()` is the only place a send
  is refused. Every new reason not to send (the **Rest period**, the sunset rule that makes
  someone **Unengaged**, a topic) is a case in it, mirrored by `composedCampaignBlocker` in
  `lib/email-campaigns/rules.ts`, with cases in
  `supabase/tests/email-marketing/campaign-rule-cases.json` run against both. The plan can never
  promise a send the claim then refuses.
- **(2) Audiences are CRM filters, never a copy.** Every audience is a filter on the Customer
  overview through `applyCustomerFilters`, so the same words are a list, a **Segment** and an
  **Audience**. Email campaigns adds no filter of its own; an **Exclusion** is a Segment too. A
  Segment is read again at every **Wave**.
- **(3) A stage, a filter, a Segment or an Exclusion only ever narrows.** None of them is consent.
  Whatever the Audience, only a `subscribed` Customer, not suppressed and not rested, receives.
- **(4) A click is recorded on the send, never used to identify a browser.** A **Campaign click**
  token proves the link came from that email, not who holds it (emails are forwarded). It is
  written to the `customer_campaign_sends` row and never merges a **Visitor** into a
  **Customer**; ADR 0007's deterministic merge (Sign in, checkout email) is unchanged. Purchases
  after a campaign are attributed by `customer_id`. No link rewriting, no open pixel.
- **(5) Rested is not failed.** A Customer skipped for the Rest period gets no ledger row, so the
  next Wave reaches them; the plan says when they are next eligible.
- **(6) Kept sending sends only what a person approved.** A campaign may keep sending, one Wave a
  day, to people who join its Audience after a first Wave a person started after a test. Its
  email and Audience stay locked; the daily job adds no content and never widens the Audience.
  It runs inside Resend's daily room, the pause rule and the Rest period, chained onto the
  existing daily job (no third cron). This reverses `PRD-crm-retention-loop` decision 6 for those
  campaigns only: every other campaign is still sent by a person, a Wave at a time.
- **(7) Transactional and aftercare email are outside all of this.** Order email stays on Gmail;
  the review request and check-up reminder keep their own rules (`PRD-customer-crm`) and never
  count toward the Rest period. The points-expiry reminders do count.

The owner's answers that shape the slices (2026-10-31):

- **Consent where people give their email: ticked by default** (ADR 0039), at checkout, on a
  customisation's contact step and on booking, each under its own **Consent source**.
- **Rest period:** 7 days between marketing emails, at most 4 in 30 days.
- **Keep sending:** yes, with a daily cap per campaign and a Pause switch.
- **The sunset rule:** a simple rule read from the Lifecycle stage. *New*, *Loyal* and *At risk*
  are never Unengaged; *At risk · Lapsed*, and a *Lead* of over 12 months, are Unengaged when they
  clicked none of their last 6 campaigns. It is a Customers filter, and campaigns leave it out
  unless they ask for it.

## Consequences

- One place to read why someone did not get an email: the claim's reason, shown on the plan.
- A new audience costs a filter, not a feature: once it is on the Customers list it can be saved,
  sent to and left out.
- Kept sending makes timing automatic without making content automatic: nothing reaches anyone
  that a person did not send to someone first.
- Clicks are approximate (link scanners click, emails are forwarded), and the results say so.
- The privacy policy needs a line on click recording before slice 08 ships, and one on the boxes
  before slice 02 is signed off (HITL).
