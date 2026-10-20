# 07 — Review request: one message after delivery, asking for a Google review

**Issue:** [#284](https://github.com/ivanyeors/mp/issues/284) (parent #277)
**Type:** AFK
**Blocked by:** 01, 13
**User stories:** 11, 12, 13, 14, 15
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:email`, `area:admin`

## Decided

The owner decided on 2026-10-20:

- **No message about the free re-adjustment window.** That reminder is dropped.
- **Instead, a review request.** Each customer gets one message after delivery that asks them to
  write a Google review. It ends with a short line saying how to reach us if they need anything
  else.
- **Timing:** 14 days after delivery.
- **The Google review link:** `https://g.page/r/CfdGhvgB1hwUEBM/review`, seeded into
  `google_review_url`.
- **Channels:** email and WhatsApp (slice 13).

**What the law and Meta make of it** (research, 2026-10-20; counsel confirms at sign-off):

- **A service message.** A review request offers nothing for sale. So it is very unlikely to be
  a commercial message under the Spam Control Act, or a "specified message" under the PDPA's Do
  Not Call rules, as long as the copy stays free of offers.
- **Utility on WhatsApp, if Meta agrees.** The template is submitted as Utility (owner,
  2026-10-20). It is tied to the customer's own order, which is what Meta's feedback rule asks
  for. Meta decides the category and may file it as Marketing instead; nothing here depends on
  which (slice 13). It goes only to customers who opted in, either way.

## Goal

Every customer who receives an order hears from us once, two weeks later, with one button to
Google's review form. The message also gives a plain way to reach us for anything else: a
re-adjustment, a spare cover, or help with an order.

## Rules from Google that this slice must keep

Google's review policy forbids **selectively asking for positive reviews**, **discouraging
negative ones**, and **offering anything in return**. Breaking these risks reviews being
removed and the profile being restricted. So:

- **Everyone eligible is asked the same way.**
  - Nobody is excluded for a return, a refund request, a low shop review, or anything else that
    signals how they feel.
  - There is no "were you happy?" step before the link.
- **The contact line is unconditional.** Write *"Need anything else? Message us…"*, never
  *"Not happy? Talk to us instead of reviewing."* A line that steers unhappy customers away
  from the review is review gating.
- **No incentive.** No voucher, discount, draw or gift for a review.

The owner reads the final copy, for email and for WhatsApp, against these three rules before
switching it on.

## Who gets it

The job runs daily, chained onto `results-sla` (ADR 0027 g).

1. **Candidates.** Counted **Orders**, meaning `paid_at` is set and the status is not one of
   `lib/readjustment/purchases.ts:30`'s exclusions. Each must also:
   - have at least one goods line (`order_items.kind = 'goods'`);
   - have `delivered_at` set.

   An in-store handover sets `delivered_at` at handover
   (`app/api/results/[id]/accept/route.ts:487-489`), so it qualifies too.
2. **Timing**, in Singapore calendar days. Both of these must hold:
   - `today ≥ delivered_date + review_request_days_after` (14);
   - `today ≤ delivered_date + review_request_max_age_days` (60).

   The upper limit means switching this on, or a backlog of orders marked delivered late,
   never messages people about old orders.
3. **Once per Customer, ever.** A Customer who has a `customer_review_requests` row is never
   asked again, whatever they buy next. A Google account can leave only one review per
   business anyway.
4. **Channels**, from slice 13's preferences:
   - email when `aftercare_email` is on and the Order has an email;
   - WhatsApp when `decideAftercareWhatsApp` says send.

   A Customer with neither channel available is skipped and counted.
5. **Other skips.** These are operational only, and are counted, not sent:
   - `review_requests_enabled = false`;
   - `google_review_url` empty.

   Orders not marked delivered are counted separately as *not marked delivered*, which is an
   operations signal.

## Schema

```sql
create table customer_review_requests (
  customer_id      uuid primary key references customers(id) on delete cascade,  -- once per Customer
  order_id         uuid null references orders(id) on delete set null,
  token_hash       text not null unique,       -- sha256 of the link token, shared by both channels
  first_clicked_at timestamptz null,
  click_count      int not null default 0,
  created_at       timestamptz not null default now()
);
```

- **Access.** Service-role only.
- **The once-per-Customer guard.** The primary key on `customer_id` is the guard. The row is
  claimed before anything is sent.
  - **Email** is recorded in the `customer_emails` ledger (migration slice 05, created by
    whichever slice lands first), with template `aftercare.review_request` and
    `entity_id = customer_id`. It is claimed as `pending`, then marked `sent` or `failed`. A
    failed send is retried by a later run, up to 3 attempts. That is deliberately unlike
    `order_emails`, whose failed rows are final (`dispatchOrderEmail` claims with
    `ignoreDuplicates`, `lib/email/index.ts:159-216`).
  - **WhatsApp** is recorded in slice 13's `customer_whatsapp` ledger, with template
    `aftercare.review_request` and `entity_id = customer_id`, so it too is sent at most once.
- **"Asked on"** (slice 12) is the earlier `sent_at` of the two ledgers' rows for this
  template.

These are `site_settings` keys:

- `review_requests_enabled` (default **false**);
- `review_request_days_after` (14);
- `review_request_max_age_days` (60);
- `google_review_url`, seeded with `https://g.page/r/CfdGhvgB1hwUEBM/review`. The job refuses
  to send while it is empty or not `https`.

## The email

`lib/email/aftercare.ts`, registered as `aftercare.review_request` (audience `customer`). It
is previewable like the rest, with a pure render.

- **Opening.** Thanks for choosing Mpillow, and the product (*"your Premium Mpillow"*, from
  `purchaseLabel`).
- **The ask.** One short paragraph: a Google review helps other people find a pillow that fits
  them.
- **One button**, *Write a Google review*. It points to our redirect, `/r/review?t=<token>`,
  never straight to Google, so the click is recorded.
- **The small line, after the button and not tied to satisfaction:**
  > Need anything else — a re-adjustment, a spare cover, or help with your order? Message us
  > on WhatsApp at {SUPPORT_WHATSAPP_DISPLAY}, or just reply to this email.

  It uses `lib/contact.ts`, which is the staffed support number and never the automated
  sender. Reply-To is the support address.
- **Footer:** *"You're getting this because you bought from Mpillow. To stop these emails, turn
  them off in your account, or reply to this email and we'll do it for you."* The link goes to
  `/account` through Sign in, the only place customers change it themselves. The reply reaches
  Staff, who use the manual switch (slice 13).
- **No** offer, price, or other product.
- **Transport:** the transactional one, through `getEmailTransport()` (`lib/email/index.ts:33`),
  which wraps `getDefaultTransport()` and lets tests swap it. This is a service message (ADR
  0027 f).
- **Registry:** `EmailGroup` is a closed union (`lib/email/registry.ts:70-78`), so add an
  `aftercare` group. Each template needs a fixture in `lib/email/__fixtures__/samples.ts`;
  `__tests__/registry-coverage.test.ts` fails the build without one.
- **Outside production**, send only to allowlisted addresses.

## The WhatsApp message

This uses slice 13's channel, with template `WHATSAPP_TEMPLATE_AFTERCARE_REVIEW`.

- **The template is `aftercare_review_request`,** drafted in slice 13 and submitted as
  Utility with `scripts/whatsapp-create-templates.ts`. No aftercare template exists on the
  WhatsApp Business account yet.
- **What it carries:** thanks, the ask, the *"Need anything else?"* line naming the staffed
  sales line, and a close saying how to stop.
- **Parameters:**
  - body: first name (or *there*), the order number, the product (`purchaseLabel`), the
    delivery date (SGT), and the sales line (`SUPPORT_WHATSAPP_DISPLAY`);
  - URL button suffix: the same token as the email (`/r/review?t={{1}}`), so WhatsApp clicks are
    recorded too.
- **A *STOP* reply** reaches Staff as an open request and pauses WhatsApp (slice 13).
- **Until the template name is set in env,** WhatsApp is skipped and email still goes.

## The redirect

`GET /r/review?t=<token>` hashes the token and looks up the request. On a match it bumps
`click_count`, sets `first_clicked_at` if it is null, and returns a 302 to `google_review_url`.

- **Never an error page.** An unknown or missing token still returns a 302 to the review URL,
  so it reveals nothing about which tokens are valid.
- **No PII in the URL.** The page is `noindex`.
- **A click is a hint, not proof.** Mail scanners such as Outlook Safe Links prefetch links.
  Slice 12 treats `first_clicked_at` as a hint that strengthens a match, never as proof.

## Admin Panel

- **The Aftercare card on the Customers page** (*Settings* tab). Seeing it needs `customers`;
  changing a setting needs `customers-edit` (slice 10). It shows:
  - the settings;
  - requests sent by channel, and clicked, in the last 30 days;
  - Google reviews linked to a requested Customer (slice 12);
  - skipped, by reason.
- **Timeline.** A review-requests adapter for slice 03: *Review requested (email, WhatsApp)*,
  then *Review link clicked*.

## Acceptance criteria

- [x] vitest covers the timing rule as a pure function: too early, on day 14, past the maximum
      age, not delivered, in-store handover, and across midnight SGT.
- [x] A Customer is asked at most once, across many Orders, both channels and concurrent runs.
      The primary key and the WhatsApp ledger prove this, not timing.
- [x] A Customer with an open return or a refund request is still asked. This is a test, so
      selective asking cannot creep in.
- [x] A Customer with email off and WhatsApp on gets WhatsApp only, and the reverse. With both
      unavailable, they are skipped and counted.
- [x] The rendered email and the WhatsApp parameters contain the review link and the support
      line, and no price, offer or other product.
- [x] An invalid token redirects to the review URL and records nothing. A valid one records the
      click once and counts every click.
- [x] With `review_requests_enabled = false` or an empty `google_review_url`, the job reports
      candidates and sends nothing.
- [ ] `./scripts/graphify update .` is run in the same commit. — _not yet: the integrator
      rebuilds the graph after merging the parallel slices._

## Build notes

Built on `claude/shopify-migration-plan-izv7fo` @ `e03159a` (CRM 13, CRM 14 and migration slice
05 merged).

**What was built**

- **Migration** `supabase/migrations/20261020124000_customer_review_requests.sql`:
  - `customer_review_requests`, exactly as specified, plus `check (click_count >= 0)` and indexes
    on `created_at` and `first_clicked_at`. Server-only: RLS on, no policy, `revoke all` from
    anon and authenticated;
  - `record_review_request_click(token_hash)`: one statement that counts every click and stamps
    the first. Executable by the service role only;
  - a partial index on `orders.delivered_at` for the candidate scan;
  - the four `site_settings` keys, seeded (`review_requests_enabled = 'false'`, 14, 60, and the
    owner's Google link).
- **The pure rules**, `lib/aftercare/review-request.ts`: the settings, the timing rule
  (`reviewRequestTiming`, SGT calendar days), the database pre-filter (`dueWindow`), who is a
  candidate (`selectReviewRequestCandidates`), the product label, the channel plan, and the run's
  report. `REVIEW_ORDER_SELECT` names every column the order query reads; none is a refund
  request, return, rating or note.
- **The email side of the channel decision**, `lib/aftercare/channels.ts`
  (`decideAftercareEmail`, the non-production allowlist). Shared with slice 08. The WhatsApp side
  is slice 13's `decideAftercareWhatsApp`.
- **The job**, `lib/aftercare/review-request-server.ts` (`planReviewRequests`,
  `runReviewRequests`):
  - claims the `customer_review_requests` row before anything is sent;
  - sends the email through `dispatchCustomerEmail` (`customer_emails`, template
    `aftercare.review_request`, `entity_id = customer_id`, Reply-To the support inbox);
  - sends WhatsApp through `notifyAftercareWhatsApp` (`customer_whatsapp`, same key);
  - retries earlier runs' failed emails first, then asks today's candidates, at most 100 a run.
- **The daily chain**, `lib/aftercare/job.ts`: `runAftercareMessages`, chained onto
  `app/api/cron/results-sla/route.ts`. Each message type is one entry in `AFTERCARE_RUNNERS` and
  fails on its own. **Slice 08 adds `checkups` there**, its keys in `lib/aftercare/settings.ts`,
  and a section in the card; `channels.ts` is already shared.
- **The email**, `lib/email/aftercare.ts` (`renderReviewRequestEmail`), registered as
  `aftercare.review_request` in a new `aftercare` group, with a no-first-name variant, fixtures,
  and the group in the dev preview and the contact sheet.
- **The link**, `lib/aftercare/review-link.ts` (a random 22-character token, its sha256) and the
  redirect `app/r/review/route.ts`: always a 302, `noindex`, `no-store` and `no-referrer`. `/r/`
  skips the locale proxy (`proxy.ts`), so it is one hop to Google.
- **The Aftercare card**, `app/[lang]/settings/customers/aftercare-settings-card.tsx`, on the
  Customers page's Settings tab beside the Telegram card. It shows the switch, the two day
  counts, the Google link, the WhatsApp state, the last 30 days by channel, Google reviews linked
  (a seam for slice 12), today's plan with every skip by reason, and open STOP requests
  (`listOpenStopRequests`). Data: `lib/aftercare/card-server.ts`; route
  `app/api/settings/customers/aftercare/route.ts` (GET `customers`, PUT `customers-edit`,
  audited as `aftercare_settings.update`).
- **Telegram**: `WEEKLY_SUMMARY_SOURCES` gains `reviewRequests`
  (`lib/aftercare/review-request-counts.ts`).
- **The timeline adapter for slice 03**: `reviewRequestTimelineEntries` (pure) and
  `loadReviewRequestTimeline(admin, customer, before, limit)`, in
  `lib/aftercare/review-request-timeline.ts`. Entries are shaped like slice 03's `TimelineEntry`,
  with kinds `review_request.sent` and `review_request.clicked`. Register it with the
  `customers` permission.
- **Small changes to shared helpers**: `dispatchCustomerEmail` takes an optional `replyTo` and
  an async `render`; `NOT_A_PURCHASE` is exported from `lib/readjustment/purchases.ts`; slice 13's
  transport check is exported as `aftercareWhatsAppTransportConfigured`.
- **Env**: `AFTERCARE_EMAIL_ALLOWLIST` in `.env.example`.

**Database check** (`mp_c07`, Postgres 16 with the Supabase stubs): all 160 migrations apply.
Checked in psql:

- a second claim of the same Customer inserts nothing; three concurrent claims leave one row;
- an unknown token changes nothing; a valid one stamps `first_clicked_at` once and counts every
  click, five concurrent clicks included;
- `token_hash` is unique; a deleted Order nulls `order_id` and keeps the row; a deleted Customer
  removes it;
- anon and authenticated can neither read the table nor run the function; service_role can;
- the four settings are seeded.

**Tests added**

- `lib/aftercare/__tests__/review-request.test.ts`: the timing rule (every case in the first
  criterion), the pre-filter window, settings, candidates (one per Customer, asked-before, counted
  Orders only), the guard that the job reads no return, refund, review or note data, the product
  label, and both channel decisions.
- `lib/aftercare/__tests__/review-request-job.test.ts`, with an in-memory database that enforces
  the unique keys (`review-request-fake-db.ts`): channels per Customer; the open return, refund
  request, one-star review and note; at most once across concurrent runs, re-runs, new Orders and
  a lost claim; one token for both channels, stored only hashed; switched off, no link or an http
  link; retries and the three-attempt limit; WhatsApp never retried; the allowlist; no template;
  the Weekly summary count.
- `lib/aftercare/__tests__/review-request-copy.test.ts`: the email and the WhatsApp text carry
  the link and the support line, and no price, offer, incentive, other product or gating wording.
- `lib/aftercare/__tests__/review-request-timeline.test.ts` and `lib/aftercare/__tests__/job.test.ts`.
- `app/r/review/__tests__/route.test.ts`, `app/api/settings/customers/__tests__/aftercare-route.test.ts`
  and `app/[lang]/settings/customers/__tests__/aftercare-settings-card-render.test.tsx`.
- The existing guard test (`customers-write-guard.test.ts`) finds the new PUT and passes.

**Deviations**

- **A retried email carries a fresh link token.** Only the token's hash is stored, so a later
  run cannot rebuild it. The run that wins the retry claim mints a new token and replaces the
  hash. A WhatsApp button sent with the first token still reaches Google, but its click is no
  longer recorded. A click is only a hint, and the case needs a failed email and a WhatsApp
  opt-in together.
- **A failed email is retried only while its Order is inside the timing window and the email
  switch is still on.** Without that, a customer who switched email off and on again weeks later
  would get a late request.
- **Nothing is claimed for a Customer no channel can reach.** They stay a candidate, so turning a
  channel on inside the window still reaches them. Each run counts them as skipped.
- **The message names one Order:** the Customer's latest delivered Order that is due.
- **"Skipped, by reason" on the card is today's dry run of the job,** not a stored history. That
  needs no new table or settings key, and the card and the job cannot disagree.
- **The Weekly summary** counts Customers asked in the week and how many of those opened the
  link. It adds no line in a week with none, so it says nothing while the feature is off.
- **Outside production, email needs `AFTERCARE_EMAIL_ALLOWLIST`, and an empty list allows
  nobody.** `WHATSAPP_ALLOWLIST` works the other way: empty allows everyone. Production is
  decided by `VERCEL_ENV` when it is set, because previews build with `NODE_ENV=production`.
- **With no usable review link, the redirect goes to the home page,** never to an error page.
- **The email's subject and opening sentence are new copy**: *"Would you review Mpillow on
  Google?"* and *"Thank you for choosing Mpillow. Your Premium Mpillow (order …) was delivered
  on …"*. The support line and the footer are word for word as the slice gives them.
- **`docs/email-templates-preview.html` was not regenerated.** It already lacks migration slice
  05's `account` group; `pnpm email:sheet` rebuilds it.

**Left for ops or the owner**

1. Apply the migration.
2. Read the email (dev preview: `aftercare.review_request`) and the WhatsApp message against
   Google's three rules, then switch review requests on in the Aftercare card.
3. Make sure `SUPPORT_EMAIL` is the watched support inbox: it is the Reply-To, and replies asking
   to stop are handled with Staff's switch.
4. Slice 13's open question still applies: the approved WhatsApp button points at
   `https://mpillow.com/r/review`. Confirm that path reaches this app before submitting the
   template. The email uses this app's public origin.
5. On a preview deploy, set `AFTERCARE_EMAIL_ALLOWLIST` to test the email.
6. Register `loadReviewRequestTimeline` in slice 03's adapter registry, with `customers`, once
   both slices are merged.
