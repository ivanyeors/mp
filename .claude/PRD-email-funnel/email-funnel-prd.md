# PRD — Email funnel: every email we send by itself, laid along the Lifecycle stages

**Status:** slices 01–04 and 06 built 2026-11-18 and merged (#439); slice 07 (arrange the flow)
built 2026-11-19. No migration. Slice 05 is the owner's: the Lead Playbook's words, and the walk.
**Owner request (2026-11-18):** "Research, design, implement our email marketing automation based
on our customer segments, designed from a marketing funnel point of view. As a user, I want to be
able to look into the different funnel stages, and in each funnel stage I can see the customer
segments that we are targeting, the email automation logic flow that we are sending in each
funnel stage, and email breakdown of the results."
**Builds on:** `PRD-crm-retention-loop` (the **Lifecycle stage**, **Playbooks**),
`PRD-campaign-audiences` (**Segments** as **Audiences**, the **Rest period**, **Kept sending**,
results by stage, the **Holdout**, **Unengaged**; ADR 0040), `PRD-customer-crm` (**Aftercare
messages**; ADR 0028), ADR 0050 (draft reminders).
**ADR:** [0054](../../docs/adr/0054-email-funnel-reads-what-is-set-up.md).
**Owner direction (2026-11-18, later the same day):** "Don't think of the content, think from an
email marketing person that will use this UI to create any content they want. This person should
be able to see the visuals of the funnels and also the visuals of how the automation emails will
look like." The page is a marketer's workspace: the funnel is a picture, every email is shown as
it looks, and any email can be added from it (Solution 1, 3 and 5; decision 9; slice 06).

## Problem statement

Every part of an automated email programme is built, and no page shows it as one.

1. **The emails that send by themselves live in four places.** Draft reminders are a job
   (`lib/draft-reminders`), the **Review request** and the **Check-up reminder** are on
   Customers → Settings (`lib/aftercare`), **Kept sending** campaigns are a switch on each
   campaign's Send tab, and the order and quote emails are on Email templates. Nobody can answer
   *what does a New customer receive from us, and when?* without reading code.
2. **A stage's Segments and the campaigns sent to them are joined only by a dropdown.** The
   Customers page lists Segments; a campaign names one. Nothing lists, for *At risk*, the
   Segments that cut it and the emails each one receives.
3. **Results are per campaign, never per stage.** The Results tab splits one campaign by the
   stage people had when sent (`email_campaign_stage_results`). The opposite question, *what did
   every email do for people who were Leads when they got it?*, has no page. The automatic
   emails' outcomes (a review link opened, a booking after a check-up, a Draft finished after a
   reminder) are counted in three different cards or not at all.
4. **The designed programme is unwritten.** Four **Playbooks** exist, one each for *New*,
   *Loyal*, *At risk* and *At risk · Lapsed*. Which are running, which were never started, and
   what a *Lead* gets beyond draft reminders is not recorded anywhere.

## Research

Sources are mostly vendor guidance (Klaviyo, Omnisend, Braze, Customer.io), so their numbers are
directional. The primary sources are Google's and Yahoo's sender rules, Resend's acceptable use
policy and Singapore's statutes. Nothing independent covers pillows or mattresses.

- **Flows are organised by lifecycle stage, and each stops on the next stage's event.** Welcome
  for a new subscriber, abandonment for an unfinished basket, post-purchase by delivery (not by
  order), cross-sell once nothing was returned, win-back timed from the product's own repurchase
  cycle, then a sunset
  ([Klaviyo, win-back](https://help.klaviyo.com/hc/en-us/articles/115002775192);
  [Klaviyo, post-purchase](https://help.klaviyo.com/hc/en-us/articles/115002775212);
  [Klaviyo, sunset](https://help.klaviyo.com/hc/en-us/articles/360044054732)).
  → *The page's stages are the **Lifecycle stage**, which already moves on those events. A step
  stops because the Customer left the stage or the Segment, not because a flow engine says so.*
- **Exit rules are filters read again before every step**, not only at entry
  ([Klaviyo, flow filters](https://help.klaviyo.com/hc/en-us/articles/115002779051)).
  → *A **Segment** is read again at every **Wave** (ADR 0040, decision 2), so we have this.*
- **Flows must not collide.** Every mature tool has one spacing rule across flows and campaigns,
  with transactional email outside it
  ([Klaviyo, Smart Sending](https://help.klaviyo.com/hc/en-us/articles/115002779311);
  [Braze](https://www.braze.com/docs/user_guide/messaging/messaging_fundamentals/frequency_capping/faq);
  [Customer.io](https://docs.customer.io/journeys/send/timezones/message-limits/)).
  → *The **Rest period** is that rule (7 days, 4 in 30). The page draws it between two marketing
  emails in a stage, and never beside a service email.*
- **Report clicks and purchases, never opens.** Apple Mail opens every email itself
  ([Mailchimp](https://mailchimp.com/help/apple-privacy-faq/);
  [Litmus](https://www.litmus.com/email-client-market-share)); click rates held
  ([Omeda](https://www.omeda.com/the-impact-of-apples-mail-privacy-protection-6-months-later)).
  Per email: sent, clicked, bought in a window, unsubscribed, marked as spam. The honest measure
  of what an email added is a holdout
  ([Klaviyo](https://www.klaviyo.com/blog/global-holdout-groups)).
  → *Exactly what `email_campaign_stage_results` and the **Holdout** record. Nothing new is
  measured for campaigns.*
- **The limits that end a programme are the sender's.** Resend: spam reports under 0.08%,
  bounces under 4% ([Resend](https://resend.com/legal/acceptable-use)). Gmail: under 0.1%, never
  0.3%, one-click unsubscribe ([Google](https://support.google.com/a/answer/81126)).
  → *The pause rule already holds a Wave at 2% bounces or 0.1% spam reports. The page shows spam
  reports per email so a bad one is seen.*
- **Singapore.** Marketing email rests on PDPA consent; the Spam Control Act's `<ADV>` label
  applies to unsolicited bulk mail, and an unsubscribe must be honoured within 10 business days.
  A service message stays one only while that is its sole purpose
  ([PDPC](https://www.pdpc.gov.sg/-/media/Files/PDPC/PDF-Files/Advisory-Guidelines/Advisory-Guidelines-on-the-DNC-Provisions-1-Feb-2021.pdf)).
  → *The page marks every step **Service** or **Marketing** and says which consent it reads.
  ADR 0039 and ADR 0028 (f), (h) are unchanged.*
- **How tools show it.** A stage row with counts; under a stage its emails as nodes with the
  wait and the condition before each; on each email node its sent, clicked and converted numbers;
  exits named by reason ([Klaviyo](https://help.klaviyo.com/hc/en-us/articles/115002779351);
  [Customer.io](https://docs.customer.io/journeys/campaign-metrics/);
  [HubSpot](https://knowledge.hubspot.com/reports/create-custom-funnel-reports)).
  → *The page's three parts per stage.*

## The programme

What each stage is sent, as designed. **Automatic** emails exist and run from the daily job.
**Playbooks** are ready-written campaigns that reach people as they join the Segment once a
person has sent the first **Wave** and turned on *Keep sending* (ADR 0040, decision 6).

| Stage | Who | Step | Kind | When | Stops when |
|---|---|---|---|---|---|
| **Lead** | has an unfinished Draft (usually a Lead; a past buyer who starts a new one gets them too) | Finish your pillow (3 reminders) | Automatic · marketing consent | 1 day, 1 week, 1 month after the last save | they hold, pay for or submit a Result since; unsubscribed |
| | has a priced build | Build ready, payment due, hold expired | Automatic · service | on the event; payment due after 3 days, every 3 days, at most 3 | paid, declined or expired |
| | every subscribed Lead | *How your pillow is made* | Playbook (new, **words need the owner**) | as they become a Lead | they buy or attend a booking (*New* / *Loyal*) |
| **New** | every buyer | Order, delivery and return emails | Automatic · service | on the event | |
| | delivered | Review request | Automatic · service (`aftercare_email`) | 14 days after delivery, once per Customer ever | |
| | delivered over 60 days ago | *Second purchase* | Playbook (approved) | as they pass 60 days | a second purchase (*Loyal*) |
| **Loyal** | 2+ purchases or an attended booking | *Thank you* | Playbook (approved) | as they become Loyal | |
| | Premium owners | Check-up reminder | Automatic · marketing consent | every 12 months after delivery | re-adjusted or reminded in the period |
| **At risk** | 12 to 24 months | *We miss you* | Playbook (approved) | as they pass 12 months | a purchase or an attended booking (*Loyal*) |
| | Premium owners | Check-up reminder | Automatic · marketing consent | as above | as above |
| | Lapsed, over 24 months | *Welcome back* | Playbook (approved), reaches the **Unengaged** | as they pass 24 months | as above |
| **Lost** | unsubscribed | no marketing email; service emails about an order still go | | | |

Everyone before *Lead* (a **Visitor** who has not given an email) has no address, so no email:
the page starts at *Lead*, and says so. The sunset rule (**Unengaged**) is shown on *Lead* and
*At risk*, where it applies.

**What was left out, and why.** A welcome series of three and a fortnightly nurture (vendor
guidance for frequent purchases) would use the 4-in-30 limit on people who are months from
buying; one Lead email is where we start, and its numbers decide a second. A care email at
delivery would land beside the Review request, and the *Second purchase* Playbook already
carries care at 60 days. No step offers a discount, asks for a rating, or adds an offer to a
service email (ADR 0028 f; `PRD-customer-crm` README, second and sixth hazards).

## Solution

One page, **Admin Panel → Email campaigns → Funnel** (`/settings/campaigns/funnel`, the
`campaigns` permission). A marketer's workspace: it shows the funnel and the emails as they look,
and every email in it is made in the campaign editor, opened from here.

1. **The funnel, as a picture.** *Lead > New > Loyal > At risk > Lost* as connected tapering
   bands, sized by Customers, each with its Customers now, how many are subscribed, and how many
   emails are in it. Choosing a stage shows its three parts. The stage is in the URL
   (`?stage=at-risk`), so a view can be shared.
2. **Segments.** Every live **Segment** whose filters name the stage, with its filters as
   chips, its live count, the emails that send to it and the campaigns that leave it out, and
   links to the list on Customers and to *Email this Segment*. A Playbook's Segment that does
   not exist yet is listed as *Not created*.
3. **Email flow, with the emails in it.** The stage's steps as cards joined by connectors: who
   enters, then each email as a card carrying **a thumbnail of the email as the real renderer
   draws it**, its name and subject, what it waits for, its kind (*Service*, *Automatic*, *Keeps
   sending*, *One-off*), its state (*On*, *Off in settings*, *Draft*, *Started*, *Keeps sending,
   20 a day*, *Paused: why*) and its key numbers, then what ends it. A campaign whose Segment is
   *got X* / *clicked X* / *got X, didn't click* branches under X. The **Rest period** is drawn
   between marketing emails. A card opens the email large, as it will be sent, on a desktop or a
   phone, in light or dark, with its results and its links: the campaign, Customers → Settings,
   Email templates.
4. **Results.** One row per email that reached people in this stage: sent, clicked,
   unsubscribed, marked as spam, bought within 30 days and what they spent, with the same words
   and rules as the campaign Results tab. Campaigns are counted by the stage each person had
   when sent (`stage_at_send`), so a one-off campaign to everyone subscribed has a row in every
   stage it reached. Automatic emails show what they record: sent; for the Review request, link
   opened; for the Check-up reminder, followed by a booking; for draft reminders, Drafts
   finished afterwards. *Lost* shows which emails people unsubscribed from.
5. **Create from the funnel.** Whatever the marketer wants to send, started where it belongs:
   - **Add an email** at the end of a stage's flow opens New campaign for that stage
     (`/settings/campaigns/new?stage=<stage>`): the stage's Segment chosen, or created if there
     is none, and the Start panel as ever: blank, Write with AI, any Starter, a past campaign.
   - **Add a follow-up** on a campaign opens New campaign for the people who *got it*, *clicked
     it* or *got it, didn't click* (`/settings/campaigns/new?after=<campaign id>:<did>`), its
     Segment chosen or created.
   - **A Playbook not started** is a dashed *Suggested* card with its thumbnail; *Start from
     this* opens New campaign started from it (`?starter=<id>`), its Segment created if missing.
   - From there it is an ordinary campaign: a person checks it, sends the first Wave and turns
     on *Keep sending*.

## Decisions

1. **The funnel's stages are the Lifecycle stage.** No second list of stages for email. The
   stages before *Lead* have no address.
2. **Nothing new sends.** A step is an automatic email that already exists, or an **Email
   campaign**. Automation is **Kept sending**: a person sends the first Wave, the daily job sends
   the rest. No new sender, no branching engine, no third cron, no schema change.
3. **The page is derived, never stored.** A campaign belongs to the stages its Segment's
   `stage` filter names; a Playbook step is *set up* when a live campaign's Segment has the
   Playbook's filters and the campaign still carries the Playbook's name or subject (so an email
   Staff add to the stage's own Segment is never taken for the Playbook). Nothing records "this
   campaign is step 3".
4. **Order within a stage comes from Segments and the Rest period.** A follow-up is a campaign
   whose Segment reads the first (*got it*, *clicked it* or *got it, didn't click*), which the
   Customers filters already offer. One whose Segment names no stage sits under the campaign it
   reads, in that campaign's stages. *Didn't get it* is not a follow-up. The page draws that, and
   (decision 10) re-points a draft's Segment when it is dragged.
5. **Results use the campaign Results tab's rules**: rates over people sent, a dash when nobody
   was, no opens, *Bought within 30 days* never called conversions, the still-counting note.
6. **Numbers are since each email started.** `email_campaign_stage_results` has no dates. A
   period picker needs a dated view; left out until someone asks (a `ponytail:` comment says so).
7. **A new Playbook is offered only once the owner approves its words**
   (`APPROVED_PLAYBOOKS`). *How your pillow is made* ships as a draft: on the page it reads
   *Words waiting for the owner*, and it cannot be started.
8. **"Email flow" is the picture, not a builder.** Kept sending is still never called an
   automation, a flow or a drip (`CONTEXT.md`): one campaign is one email.
9. **The page is for making any email, not for a fixed programme** (owner, 2026-11-18). The
   designed steps are the Automatic emails, which exist, and Playbooks, which are suggestions.
   Everything else in a flow is what Staff added. An email is always written in the campaign
   editor; the funnel opens it with the right Segment. Thumbnails and previews are the real
   renderer's output with sample details, never a mock-up, so they cannot drift from what is
   sent.
10. **The flow is arranged by dragging, and arranging stores no position** (owner, 2026-11-19).
   B is sent after A when B's Segment reads A, so moving a draft changes only the *Campaign*
   filter of its Segment: the campaign is pointed at the Segment with those filters, found or
   created. Only a draft moves; a started campaign keeps its Audience, and a Playbook's draft
   keeps the Segment that makes it the Playbook. A new email can be slotted between two, and an
   approved Playbook can be added as a draft in one click. None of it plans a Wave: the owner
   asked that nothing be sent, drafts only.

## Hazards

Inherited, unchanged: consent in one SQL rule (ADR 0040), no review gating, no offer in a
service email, Resend's plan, no third cron, no PII in Telegram, no Shopify dependency. New:

- **A stage count is not who will be emailed.** The strip shows Customers and, beside it,
  subscribed; the Rest period, suppression and the sunset rule narrow it again at each send.
- **`stage_at_send` is the stage then.** A Lead who bought after the email is still a Lead in
  that email's row. That is the point: it is what the email did for Leads.
- **Reads capped at 1,000 rows.** PostgREST returns at most 1,000 rows per request. Every count
  on the page is a `head: true` count or pages to the end.
- **The page must never name a Customer.** Counts only, as the Aftercare card. A Segment's
  *search* filter is shown as a chip without its words: the page needs `campaigns`, not `customers`.

## Out of scope

- Sending without a person starting the first Wave; branching inside one campaign; scheduling.
- A period picker and trends; conversion between stages (nothing records when a stage changed).
- Visitors and Engaged visitors (Analytics → journey covers them, per Visit).
- Topics (`PRD-campaign-audiences` slice 13), WhatsApp marketing, SMS.
- Changing any email's words, timing or consent rule.

## Slices

See [`issues/README.md`](issues/README.md).
