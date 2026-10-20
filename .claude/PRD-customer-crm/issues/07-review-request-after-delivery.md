# 07 — Review request: one email after delivery, asking for a Google review

**Type:** AFK
**Blocked by:** 01; owner decision 1 for the default timing
**User stories:** 11, 12, 13, 14, 15
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:customers`, `area:email`, `area:reviews`

## Decided

**No email about the free re-adjustment window** (owner, 2026-10-20). That reminder is
dropped.

In its place, each customer gets one email after delivery that:

- asks them to write a Google review;
- ends with a short line saying how to reach us if they need anything else.

## Goal

Every customer who receives an order hears from us once, a couple of weeks later. The email
has one button to Google's review form. It also gives a plain way to reach us for anything
else: a re-adjustment, a spare cover, or help with an order.

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

The owner reads the final copy against these three rules before switching it on.

## Who gets it

The job runs daily, chained onto `results-sla` (ADR 0027 g).

1. **Candidates.** Counted **Orders**, meaning `paid_at` is set and the status is not one of
   `lib/readjustment/purchases.ts:30`'s exclusions. Each must also:
   - have at least one goods line (`order_items.kind = 'goods'`);
   - have `delivered_at` set.

   An in-store handover sets `delivered_at` at handover
   (`app/api/results/[id]/accept/route.ts:334-337`), so it qualifies too.
2. **Timing**, in Singapore calendar days. All of these must hold:
   - `today ≥ delivered_date + review_request_days_after` (default 14);
   - `today ≤ delivered_date + review_request_max_age_days` (default 60).

   The upper limit means switching this on, or a backlog of orders marked delivered late,
   never emails people about old orders.
3. **Once per Customer, ever.** A Customer who has a `customer_review_requests` row is never
   asked again, whatever they buy next. A Google account can leave only one review per
   business anyway.
4. **Exclusions.** These are operational only, and are counted, not emailed:
   - `aftercare_emails = false`;
   - no email on the Order;
   - `review_requests_enabled = false`;
   - `google_review_url` empty.

   Orders not marked delivered are counted separately as *not marked delivered*, which is an
   operations signal.

## Schema

```sql
alter table customers
  add column aftercare_emails boolean not null default true;
grant select (aftercare_emails) on public.customers to authenticated;   -- slice 02's grants

create table customer_review_requests (
  customer_id      uuid primary key references customers(id) on delete cascade,  -- once per Customer
  order_id         uuid null references orders(id) on delete set null,
  token_hash       text not null unique,       -- sha256 of the link token
  status           text not null check (status in ('pending','sent','failed')),
  sent_at          timestamptz null,
  first_clicked_at timestamptz null,
  click_count      int not null default 0,
  created_at       timestamptz not null default now()
);
```

- **Access.** Service-role only.
- **The once-per-Customer guard.** The primary key on `customer_id` is the guard. The row is
  claimed as `pending` before sending and marked `sent` or `failed` after, as `order_emails`
  does (`lib/email/index.ts:159-216`). A `failed` row is retried by the next run; a `sent` row
  is final.

These are `site_settings` keys:

- `review_requests_enabled` (default **false**);
- `review_request_days_after` (14);
- `review_request_max_age_days` (60);
- `google_review_url`: the *Ask for reviews* share link from Google Business Profile. The job
  refuses to send while it is empty or not `https`.

## The email

`lib/email/aftercare.ts`, registered as `aftercare.review_request` (audience `customer`). It
is previewable like the rest, with a pure render. The owner approves the copy.

- **Opening.** Thanks for choosing Mpillow, and the product (*"your Premium Mpillow"*, from
  `purchaseLabel`).
- **The ask.** One short paragraph: a Google review helps other people find a pillow that fits
  them.
- **One button**, *Write a Google review*. It points to our redirect, `/r/review?t=<token>`,
  never straight to Google, so the click is recorded.
- **The small line, after the button and not tied to satisfaction:**
  > Need anything else — a re-adjustment, a spare cover, or help with your order? Message us
  > on WhatsApp at {SUPPORT_WHATSAPP_DISPLAY}, or just reply to this email.

  It uses `SUPPORT_WHATSAPP_URL` / `SUPPORT_WHATSAPP_DISPLAY` from `lib/contact.ts`, which is the
  staffed support number and never the automated appointment sender. Reply-To is the support
  address.
- **Footer:** *"You're getting this because you bought from Mpillow. You can turn off emails
  after a purchase in your Profile."*
- **No** offer, price, or other product.
- **Transport:** the transactional one (`getDefaultTransport()`), because this is a service
  message (ADR 0027 f).
- **Outside production**, send only to allowlisted addresses, following the WhatsApp reminder's
  non-production allowlist (`whatsapp-appointment-confirm-prd.md:58,75`).

## The redirect

`GET /r/review?t=<token>` hashes the token and looks up the request. On a match it bumps
`click_count`, sets `first_clicked_at` if it is null, and returns a 302 to `google_review_url`.

- **Never an error page.** An unknown or missing token still returns a 302 to the review URL,
  so it reveals nothing about which tokens are valid.
- **No PII in the URL.** The page is `noindex`.
- **A click is a hint, not proof.** Mail scanners such as Outlook Safe Links prefetch links.
  Slice 12 treats `first_clicked_at` as a hint that strengthens a match, never as proof.

## Customer and Admin Panel

- **Profile.** An *Emails after a purchase* toggle on `/account` writes `aftercare_emails` under
  the customer's own session. Slice 08's check-up reminder uses the same toggle.
- **The Aftercare card on the Customers page.** Seeing it needs `customers`; changing a setting
  needs `customers-edit` (slice 10). It shows:
  - the settings;
  - requests sent and clicked in the last 30 days;
  - Google reviews linked to a requested Customer (slice 12);
  - skipped, by reason.
- **Timeline.** A review-requests adapter for slice 03: *Review requested*, then *Review link
  clicked*.

## Acceptance criteria

- [ ] vitest covers the timing rule as a pure function: too early, on time, past the maximum
      age, not delivered, in-store handover, and across midnight SGT.
- [ ] A Customer is asked at most once, across many Orders and concurrent runs. The primary key
      proves this, not timing.
- [ ] A Customer with an open return or a refund request is still asked. This is a test, so
      selective asking cannot creep in.
- [ ] The rendered email contains the review button, the support line and the opt-out footer,
      and no price, offer or other product.
- [ ] An invalid token redirects to the review URL and records nothing. A valid one records the
      click once and counts every click.
- [ ] With `review_requests_enabled = false` or an empty `google_review_url`, the job reports
      candidates and sends nothing.
- [ ] `./scripts/graphify update .` is run in the same commit.
