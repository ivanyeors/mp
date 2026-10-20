# 07 — Review request: one message after delivery, asking for a Google review

**Type:** AFK
**Blocked by:** 01, 13
**User stories:** 11, 12, 13, 14, 15
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:customers`, `area:email`, `area:whatsapp`, `area:reviews`

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
   (`app/api/results/[id]/accept/route.ts:334-337`), so it qualifies too.
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
  email_status     text null check (email_status in ('pending','sent','failed')),
  email_sent_at    timestamptz null,
  first_clicked_at timestamptz null,
  click_count      int not null default 0,
  created_at       timestamptz not null default now()
);
```

- **Access.** Service-role only.
- **The once-per-Customer guard.** The primary key on `customer_id` is the guard. The row is
  claimed before anything is sent.
  - **Email** is claimed as `pending` and marked `sent` or `failed`, as `order_emails` does
    (`lib/email/index.ts:159-216`). A `failed` email is retried by the next run.
  - **WhatsApp** is recorded in slice 13's `customer_whatsapp` ledger, with template
    `aftercare.review_request` and `entity_id = customer_id`, so it too is sent at most once.
- **"Asked on"** (slice 12) is the earlier of `email_sent_at` and the WhatsApp ledger's sent
  time.

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
  them off in your account."* The link goes to `/account` through Sign in, which is the only
  place customers change it (slice 13).
- **No** offer, price, or other product.
- **Transport:** the transactional one (`getDefaultTransport()`), because this is a service
  message (ADR 0027 f).
- **Outside production**, send only to allowlisted addresses.

## The WhatsApp message

This uses slice 13's channel, with template `WHATSAPP_TEMPLATE_AFTERCARE_REVIEW`.

- **Meta has approved the template** (owner, 2026-10-20). Its wording is what Meta approved, and
  slice 13 records its variables and button.
- **What it should carry:** thanks, the ask, and a button to the review form. If the button
  has a dynamic suffix, it carries the same token (`/r/review?t={{1}}`).
- **Then the line:** *"Need anything else? Message us at {support number}."*
- **The close says how to stop:** in their account, or by messaging the support number. A
  *STOP* reply still reaches Staff (slice 13).
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

- [ ] vitest covers the timing rule as a pure function: too early, on day 14, past the maximum
      age, not delivered, in-store handover, and across midnight SGT.
- [ ] A Customer is asked at most once, across many Orders, both channels and concurrent runs.
      The primary key and the WhatsApp ledger prove this, not timing.
- [ ] A Customer with an open return or a refund request is still asked. This is a test, so
      selective asking cannot creep in.
- [ ] A Customer with email off and WhatsApp on gets WhatsApp only, and the reverse. With both
      unavailable, they are skipped and counted.
- [ ] The rendered email and the WhatsApp parameters contain the review link and the support
      line, and no price, offer or other product.
- [ ] An invalid token redirects to the review URL and records nothing. A valid one records the
      click once and counts every click.
- [ ] With `review_requests_enabled = false` or an empty `google_review_url`, the job reports
      candidates and sends nothing.
- [ ] `./scripts/graphify update .` is run in the same commit.
