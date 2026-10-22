# PRD — Email marketing

**Status:** v1 built on `claude/admiring-ride-40h2o6` (2026-10-21): Admin Panel → **Email
campaigns**. Live once the migration below is applied to production and the campaign variables
are set in Vercel (*Before the first send*).
**Owner request (2026-10-21):** "I need the marketing tool to be built so that I can test and
send to my customers that I've imported from Shopify", from "our setting page".

Its sibling, **Email templates** (`PRD-email-templates`), edits the words of every email the
platform sends; a Campaigns / Templates switch joins the two pages.

This page replaces the placeholder that recorded what the initiative inherits. Those inherited
rules are kept below, unchanged.

## What it does

A page in the Admin Panel where the owner writes an email, sends themselves a test, checks who
it would go to, and sends it in waves.

1. **Write.** A name for Staff, a subject, an inbox preview line, and the message in plain text:
   a blank line starts a paragraph, `- ` a bullet, `## ` a heading, and `https://` links become
   links. One optional button: *Sign in to their account*, or a link. "Hi <first name>," is on
   by default. A live preview renders it in the branded shell, as the customer will see it.
2. **Choose the audience.**
   - *Imported from Shopify, not signed in yet.* Every **Migrated customer** who has not
     **Claimed**.
   - *Everyone subscribed to marketing email.*
   - *A saved **Segment*** from the Customers list.
3. **Send a test.** To up to three addresses, with "[Test]" before the subject. It goes through
   the same transport and headers as a real send, and is not counted as sent to anyone.
4. **Check readiness.** Every check the migration's wave sender runs, in plain words:
   - the campaign Resend key;
   - the sending subdomain;
   - a support inbox for Reply-To;
   - the live https site;
   - one-click unsubscribe answering;
   - links signed with the site's secret;
   - the pause rule.

   A test needs the transport, sending address and Reply-To checks; a wave needs every check.
5. **Send a wave.** Choose how many people (default 50 for the first, then 200; at most 1,000),
   then *Check who it goes to*. That shows:
   - the eligible count, and how many of those have ordered before (they go first);
   - who is left out, and why.

   Then *Send to N people*, with a confirmation. The page sends 20 at a time, about two a
   second, with a progress bar and a Stop button. The first wave fixes the email and audience.
   To send a changed email, duplicate the campaign.
6. **Read the numbers.** Each campaign shows sent, bounced, marked as spam, failed, and sign-in
   links opened, on the list and on its page. Each send, bounce and complaint is also on the
   **Customer timeline**.

A new campaign opens on a ready-written invitation, *"Our new website is here, with points waiting
for you"*, with the button *Sign in and collect your points* and the audience *Imported from
Shopify, not signed in yet*. It says the site is new and never names Shopify or a move (owner,
2026-10-21). It offers the **Claim bonus**: 1,000 points, S$10 off a shop order, for signing in
within 3 months of the email (`PRD-loyalty-points`, decisions 10 and 11). Until points are on and
launched, the page refuses to send any campaign that mentions points (`pointsCheck`).

## Rules it keeps

These were decided upstream; changing one means changing that plan too.

- **Consent only.** Only `subscribed` Customers receive marketing. `unsubscribed` is never
  selected, and nothing but the customer's own action re-subscribes them. Checked in SQL at the
  moment of each send (`claim_marketing_campaign_send`), not only when the wave is planned.
- **Never the transactional mailbox.** Campaign mail uses `getCampaignTransport()` (Resend,
  `CAMPAIGN_RESEND_API_KEY`) from the campaign subdomain. A Gmail or other transport, or a From
  off the subdomain, is refused before anyone is claimed.
- **Ledger first.** A row is written before every send, unique per Customer and campaign. The
  `customer_campaign_sends.template` check is widened to `campaign:<id>`, with a `campaign_id`
  foreign key. There is no second ledger.
- **Suppression is shared.** A bounce or complaint on any campaign email suppresses that
  Customer from every later one, the migration's three templates included. The pause rule reads
  the latest wave of any campaign email: the sending reputation is one.
- **Aftercare messages are not marketing.** The review request and the check-up reminder stay in
  the CRM, under their own rules (CRM slices 07, 08, 13).
- **Never ask for reviews in a campaign** (Google's policy; CRM slice 07).
- **Email only.** No WhatsApp or SMS marketing (Do Not Call Registry duties in Singapore).
- **Every email carries an unsubscribe link and `List-Unsubscribe` with
  `List-Unsubscribe-Post` (RFC 8058).** Reply-To is the support inbox.

## Who can use it

A new permission, `campaigns` (*Email campaigns*, Store group, `/settings/campaigns`). Owner and
Admin hold it through `grants_all`. No other seeded role does: Manager and Staff hold
`customers`, and must not email the whole list (the same reasoning as `customer-import`). A role
can be given it on Users & permissions → Roles. Every server action checks it before reading
anything, and every save, duplicate, archive, test and wave start is in the audit log, with
counts, never addresses.

## How it is built

**Database** (`20261021100000_email_campaigns.sql`; server-only: RLS on, no policy, nothing
granted to `anon` or `authenticated`):

- `email_campaigns`: the content, the audience, `locked_at` and `archived_at`. Its checks mirror
  the editor's schema:
  - a Segment audience needs its Segment;
  - a link button needs an https link.

  A trigger refuses any change to content or audience once `locked_at` is set; a rename and
  archiving stay allowed. A campaign with sends cannot be deleted (`on delete restrict`).
- `customer_campaign_sends.campaign_id`, and the widened template check.
- `marketing_campaign_blocker()`, the rule. `claim_marketing_campaign_send()` runs it and writes
  the `pending` row in one call; `finish_campaign_send()` (migration slice 08) closes it. A retry
  moves a failed row back to `pending` in the new wave.
- `marketing_campaign_candidates`: every Customer with consent, migration, orders, suppression
  and their sends of every campaign.
- `email_campaign_stats`: each campaign's numbers, and its Claim links opened.

**Code**:

- `lib/email/campaigns.ts`: the pure renderer, registered as `campaign.composed` (campaign mail),
  previewable in `/dev/email-preview`. Staff type plain text, never HTML, so nothing they type
  becomes markup.
- `lib/email-campaigns/rules.ts`: the draft schema, the rule (`composedCampaignBlocker`), and the
  plan (`planCampaignWave`: buyers first, then the newest).
- `lib/email-campaigns/store.ts`: reads and writes. A Segment is resolved through
  `resolveSegment` (CRM slice 05), never a copy of its filters.
- `lib/email-campaigns/sender.ts`: readiness, the plan, the batch sender and the test. It shares
  `campaignDeliveryChecks` with the migration's wave sender. The button for an unclaimed
  Migrated customer is their own **Claim link** (`mintClaimLink`, keyed `campaign:<id>`); for
  anyone else it is their account page. Site links carry
  `utm_source=email_campaign&utm_medium=email&utm_campaign=<name>`.
- `app/[lang]/settings/campaigns/`: the list, the editor (`campaign-editor.tsx`) and the server
  actions.
- The Customer timeline names a campaign send by its campaign's name.
- The welcome page's *signed in as someone else* line no longer says a voucher was sent. It
  said that to every Claim link, and no campaign sends one.

**Tests**:

- `supabase/tests/email-marketing/campaign-rule-cases.json`: 22 cases. Both the TypeScript rule
  and the SQL function must give each case's answer.
- `assert-01-email-campaigns.sql`:
  - grants, and the table's checks;
  - claims, retries, and consent re-checked at the claim;
  - a complaint on a campaign suppressing the migration emails;
  - the ledger check, the views, and the lock.
- vitest:
  - `lib/email-campaigns/__tests__/rules.test.ts` and `sender.test.ts`, against an in-memory
    ledger;
  - `lib/email/__tests__/composed-campaign-email.test.ts`;
  - `app/[lang]/settings/campaigns/__tests__/page-gate.test.tsx`: the permission on the pages
    and on every action, and that a new campaign has no offer.

## Before the first send (ops, HITL)

The page runs on Vercel, so what the script read from a laptop must now be set there.

1. **Apply the migration** `20261021100000_email_campaigns.sql` to production.
2. **Owner decision 4 of the migration:** a Resend account and a sending subdomain (for example
   `hello.mpillow.com`), with Resend's SPF and DKIM records and a DMARC record (`p=none` to
   start), verified in Resend.
3. **Vercel → Production environment variables:**

   | Variable | Value |
   |---|---|
   | `CAMPAIGN_RESEND_API_KEY` | the campaign's Resend key. Never name it `RESEND_API_KEY`: that moves order email to Resend. |
   | `CAMPAIGN_EMAIL_FROM` | for example `Mpillow <hello@hello.mpillow.com>` |
   | `CAMPAIGN_EMAIL_DOMAIN` | the subdomain, for example `hello.mpillow.com` |
   | `SUPPORT_EMAIL` | where replies go |
   | `UNSUBSCRIBE_SECRET` | already set for migration slice 07 |
   | `CAMPAIGN_RESEND_WEBHOOK_SECRET` | from step 4 |

   Keep `EMAIL_PROVIDER=gmail`.
4. **The webhook.** In Resend, add `https://<site>/api/email/resend-webhook` for
   `email.bounced` and `email.complained`. Without it, bounces and spam reports are not
   recorded, and the pause rule cannot see them.
5. **On the page, every check is green.** Send a test to Gmail, Outlook and Yahoo inboxes, and
   check:
   - it lands in the inbox, not spam;
   - Gmail's own Unsubscribe button works;
   - the button signs in;
   - SPF, DKIM and DMARC pass (*Show original*).
6. **Pilot:** a first wave of 25–50, buyers first. Wait 48 hours and look at bounces, spam
   reports and sign-ins before the next wave. That is migration slice 09's ramp, run from this
   page instead of the script.

## Not in v1

- **Scheduling.** A wave is sent from the open page; there is no cron. A wave cut short is
  finished by the next one, which picks the people not yet sent to.
- **Open and click tracking** beyond Claim links opened. Resend's tracking would rewrite links,
  so it stays off until decided.
- **Revenue per campaign** on attributed **Orders** (the UTMs are in place for GA4).
- **First-party sign-up**, such as a newsletter form with double opt-in. Consent is captured only
  by the Shopify import and the Profile toggle.
- **Images, templates and a rich-text editor.** The body is plain text with paragraphs, bullets,
  headings and links.
- **The migration's three templates** (`migration_announcement`, `_reminder`,
  `_service_notice`) stay on the script (`scripts/customer-migration-send.ts`). Since points slice 05
  they offer the Claim bonus, not the voucher, but use a campaign instead.
