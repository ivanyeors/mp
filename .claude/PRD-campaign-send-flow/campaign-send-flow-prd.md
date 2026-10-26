# PRD — Campaign send flow: send within Resend's plan, from a page built for it

**Status:** being built on `claude/fervent-gates-d5yutu` (2026-10-26). Slices 01–04 are AFK;
slice 05 is the owner's check on production.
**Builds on:** `PRD-email-marketing` v1, merged in #296: Admin Panel → **Email campaigns**
(`/settings/campaigns`). This plan changes how that page sends and what it shows. It adds no
second sender, no second ledger and no new permission.
**Owner requests:**
- "We should stagger and send within the free limit" (2026-10-22). Resend's free plan: 100 emails
  a day, 3,000 a month.
- "Let's stick to resend": campaign mail only; order email stays on Gmail (2026-10-22).
- "Can we add a resend input API key in our settings page if we can work off from our deployed
  site?" Decided with the owner: the key stays in Vercel, and the page shows that it works
  (decision 1).
- "Let's start building, and please research the best UX/layout and interaction to implement in
  our build as well, create prd and issues to track and verify the build" (2026-10-26).

## Problem statement

The Email campaigns page can already write, test and send a campaign through Resend. Three
things stop the owner from using it safely on the free plan.

1. **It does not know Resend's limit.** A wave defaults to 50, then 200, and can be up to 1,000.
   Its tip says "a sensible start is 50, then 200, then 500 a day". The free plan allows 100 a
   day, and tests count too. Past the limit Resend answers `429 daily_quota_exceeded`. The page
   then marks each refused send failed and stops only after five in a row. The migration's
   script already keeps inside the limit (migration slice 08, `campaignSendLimits`); the page,
   which the owner will actually use, does not.
2. **Nobody can see whether sending works without opening a campaign.** The checks run on a
   campaign's own page. The list says nothing about Resend, the sending address, how many emails
   are left today, or whether bounce reports can arrive. That is why the owner asked to type the
   key into Settings.
3. **The send step is easy to click through, and its numbers are hard to act on.**
   - The confirmation is the browser's `confirm()`. It states the subject and a count, nothing
     about the sender or the audience, and looks like every other browser prompt.
   - Progress is one line with no live announcement.
   - The result disappears when the page reloads.
   - The page shows campaign totals, but the pause rule judges each wave. Nothing says how close
     a wave is to 2% bounces or 0.1% spam reports, or when the next batch can go.

## Research

What leading tools and design guidance do, and what this plan takes from them.

- **A readiness checklist, one screen, before Send.** Klaviyo's review step shows each section
  with a green tick, and a caution mark on any that needs fixing before *Schedule* or *Send*
  ([Klaviyo help](https://help.klaviyo.com/hc/en-us/articles/115005054847-Create-and-Send-a-Campaign),
  [Fera's guide](https://help.junip.co/en/articles/5315427-klaviyo-sending-a-campaign)).
  Mailchimp exposes a send checklist to "resolve any issues before sending"
  ([Mailchimp API](https://mailchimp.com/developer/marketing/api/campaigns/list-send-checklist/llms.txt)).
  Mailcoach's Send page summarises the sender's name, Reply-To, recipients and mailer next to the
  test send ([Mailcoach](https://www.mailcoach.app/features/pre-send-checklists/)).
  → *The page's Send section becomes a short checklist of steps with ticks, and the send summary
  names the From, Reply-To, audience and count.*
- **Restate the request in the confirmation, with a specific button label.** Generic "OK" and
  "Yes" are to be avoided, and the dialog should say what will happen
  ([Primer](https://primer.style/product/components/confirmation-dialog/guidelines),
  [LogRocket](https://blog.logrocket.com/ux-design/double-check-user-actions-confirmation-dialog)).
  Overused confirmations are dismissed without reading (dialog fatigue); type-to-confirm is for
  the highest stakes, and a checkbox is lighter friction for moderate stakes
  ([UX Psychology](https://uxpsychology.substack.com/p/how-to-design-better-destructive),
  [techinterview](https://www.techinterview.org/post/3233475217/build-confirmation-dialog-patterns/)).
  Default focus goes to Cancel.
  → *A real dialog (decision 4): "Send to 62 people?", the summary, the irreversible part, Cancel
  focused, and "Send to 62 people" as the button. The first wave adds one checkbox, because it
  also locks the email.*
- **Resend's quota.** Free accounts have 100 emails a day and 3,000 a month. Sent and received
  emails both count, and each recipient counts separately. Past it the API answers 429 with
  `daily_quota_exceeded` or `monthly_quota_exceeded`. The docs say to "wait until 24 hours have
  passed", so the day is rolling. The rate limit is 2 requests a second on an older page and 10 on
  the newer one ([quotas](https://resend.com/docs/knowledge-base/account-quotas-and-limits),
  [sending limits](https://resend.com/docs/knowledge-base/resend-sending-limits),
  [email quota](https://resend.com/docs/knowledge-base/resend-email-quota)).
  → *The page counts its own sends and tests over a rolling 24 hours and 31 days (decision 2),
  sends a wave only up to what is left, says when room opens again, and treats a 429 as an
  immediate stop. It keeps two a second.*
- **Ramp a new sending domain slowly, and watch bounces and complaints.** Gmail's bulk-sender rule
  is a spam rate under 0.3%; practitioners aim under 0.1%, and hold volume flat when hard bounces
  pass 2–3% ([Suped](https://www.suped.com/knowledge/email-deliverability/sender-reputation/how-does-google-penalize-senders-with-spam-rates-over-03),
  [Palisade](https://www.palisade.email/learning/how-do-you-warm-up-a-new-sending-domain-safely.md),
  [Warmy](https://www.warmy.io/guides/google-yahoo-sender-requirements/)).
  → *Each wave's bounce and spam rates are shown against the page's 2% and 0.1% pause lines, and
  the page suggests waiting 48 hours after the first wave (migration slice 09).*
- **Progress that everyone can follow.** A determinate bar has the progressbar role, its value,
  and a text label. A live region should not fire on every tick; announce at intervals
  ([Visa](https://design.visa.com/components/progress/accessibility/),
  [B.C. design system](https://www2.gov.bc.ca/gov/content/digital/design-system/components/progress-indicators)).
  Colour alone must not carry status.
  → *A labelled bar, and one polite announcement per batch of 20 (about every ten seconds), not
  per email. Every tick and cross also has words.*

## Solution: what the owner sees

**Email campaigns (the list).** A **Sending** card at the top:

- *Resend connected* (or what is missing), *Sending from* `hello@hello.mpillow.com`,
  *Replies go to* the support inbox, *Bounce and spam reports* set up or not.
- **Today**: "38 of 100 sent · 62 left", with a bar. **This month**: "140 of 3,000". When none is
  left: "Room again from Tue, 3:40 pm".
- The key is never shown. The card names the Vercel variables to set when something is missing.

**One campaign.** The email, its preview and the test stay as they are. The send area becomes:

1. **Checklist:** saved · test sent · every check passes · today's room. Each row has a tick or a
   cross, words, and a fix.
2. **Who it goes to:** eligible, buyers first, who is left out and why, and how many can go
   **today**. When the audience is bigger than today's room: "62 today; the other 238 go in later
   waves, about 3 more days at 100 a day."
3. **Send to 62 people** opens the confirmation dialog: subject, From, Reply-To, audience,
   count, "This can't be undone", and on the first wave "Sending locks this email".
4. **Sending:** a labelled bar, *Sent 20 of 62*, Stop, and "keep this page open". On a phone the
   main button sits in a bar at the bottom.
5. **Result:** sent, skipped, failed, why it stopped, and what next: "Come back after 3:40 pm
   tomorrow to send the next 100", or "Retry the 2 failed".
6. **Waves:** one row per wave, with when it went, how many were sent, bounce % and spam % against
   the 2% and 0.1% lines, failed, and sign-ins. A wave over a line shows as paused, with the
   existing "I've looked into it: send anyway" choice.

## Decisions

1. **The Resend key stays in Vercel, not in a Settings field** (owner, 2026-10-26). Settings →
   General → API configs keeps keys as plain text in `api_configs.api_key`, and its GET returns
   the full key to the browser. A Resend key can email the whole list from the brand's domain.
   Storing it safely would need an encryption key, which is one more Vercel secret anyway, and the
   key is set once. `CAMPAIGN_RESEND_API_KEY` is set in Vercel, Production only, Sensitive. The page
   shows that it works and never shows it. Never `RESEND_API_KEY`, which moves order email to
   Resend.
2. **The allowance is counted here, from the ledger and the tests.** Resend's API gives a key
   with sending access no usage call; the `x-resend-daily-quota` header arrives only on a send.
   So the page counts what it can see:
   - every `customer_campaign_sends` row that used a send (pending, sent, bounced, complained)
     over the last 24 hours and the last 31 days, every template and campaign, migration emails
     included;
   - plus each test (`email_campaign.test` in the audit log, its `sent` count).

   Rolling windows hold at least what Resend counts. The limits are the free plan's unless
   `CAMPAIGN_DAILY_SEND_LIMIT` / `CAMPAIGN_MONTHLY_SEND_LIMIT` say otherwise; lower them if
   anything else uses the account. A 429 quota answer stops the wave at once: it is the backstop
   for anything the count missed.
3. **A wave never goes past today's room; the rest wait for the next wave.** There is no cron:
   a person presses Send each day (PRD-email-marketing, *Not in v1*). A wave the room cut short
   is finished by the next one, which already picks only the people not yet sent to. Each batch
   re-reads the room, because the script or a second tab may have sent meanwhile.
4. **One confirmation dialog, with one checkbox on the first wave only.** The send is already
   gated by every check, and later waves repeat the same email. Typing a word to confirm would be
   friction on every wave and teaches nothing. The first wave also locks the email, so it asks
   "I sent myself a test and it looked right". Cancel has the focus.
5. **A test needs room too.** It counts toward Resend's quota, so it is refused when today's
   room is smaller than its addresses, with the time room opens again.

## Not in this plan

- **Scheduling, or sending without the page open.** Decided upstream; unchanged.
- **Typing or rotating the key in the Admin Panel** (decision 1).
- **Reading Resend's own usage, domains or logs.** A sending-only key cannot, and a full-access
  key on the server is what decision 1 avoids.
- **Open and click tracking**, and revenue per campaign (PRD-email-marketing, *Not in v1*).
- **The migration's three templates on the page.** They stay on the script, which now counts tests
  in the same allowance.

## Testing

- vitest, against the in-memory ledger (`lib/email-campaigns/__tests__/fake-db.ts`, extended with
  `customer_campaign_sends` and `admin_audit_log`):
  - the allowance: the ledger and tests counted over both windows, the binding limit, when room
    opens again, and the environment's limits;
  - planning: a wave cut to today's room, the rest reported, and nothing planned at zero;
  - sending: a batch cut to the room left, a stop when it runs out mid-wave, and an immediate stop
    on a 429 quota answer;
  - a test refused without room.
- Component tests: the Sending card's words for each state, the confirmation's summary and button,
  the wave table's thresholds, and the Send card's checklist.
- A visual check at 375px and 1280px (2026-10-26): the dialog opens with Cancel focused and the send
  button disabled until the first-wave tick, and nothing scrolls sideways on a phone. Radix renders
  the dialog in a portal, which a server render cannot show.
- Slice 05 is the owner's check on production.
