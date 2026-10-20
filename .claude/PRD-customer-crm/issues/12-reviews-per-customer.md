# 12 — Reviews on every Customer: shop reviews, review requests, and Google reviews matched by Staff

**Type:** AFK, plus one HITL dependency (the Google review sync must be live)
**Blocked by:** 04, 07, 10
**User stories:** 21, 22, 23
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:customers`, `area:admin`, `area:reviews`

## Goal

A **Review** column on the Customers list, and a **Reviews** card on the detail. Together they
answer:

- did this customer review us, where, and how many stars;
- did we ask them, and did they open the link.

## What can be tied to a Customer, and how surely

| Source | Link to the Customer | How sure |
|---|---|---|
| Shop reviews, `product_reviews` (`0028_ecommerce.sql:498`) | `customer_id` (`:501`) and `order_id` | exact |
| Review request (slice 07), `customer_review_requests` | `customer_id` | exact for *asked on*; `first_clicked_at` is a **hint**, because mail scanners prefetch links |
| Google reviews, `google_reviews` (`20261002060000_google_review_replies.sql:40`) | **none** | Google gives a review only a display name, a photo and an anonymous flag (`lib/google/business-profile.ts:28`), never an email. A link is a **suggestion** that Staff confirm. |

**A name is not an identity**, so a Google review is never linked automatically (ADR 0027 k).
Two customers can share a name. A display name like *"Jane T."* or a nickname may match nobody,
or match the wrong person.

## The Google side depends on the review sync being live

`google_reviews` fills only once Google approves Business Profile API access, and the
Pub/Sub sync is set up (`.claude/PRD-google-review-replies/OPS-CHECKLIST.md`, steps 1–2).
Until then the Google part of the column shows only *Asked* and *Clicked*. Everything else in
this slice still ships. The one location is `GOOGLE_BUSINESS_LOCATION`.

## Matching Google reviews

### Suggestions, computed when read

`suggestGoogleReviewMatches(review, candidates)` is a pure function in
`lib/crm/review-match.ts`.

- **Candidates.** Customers who were sent a review request within 45 days before the review was
  created, plus Customers with an Order delivered within 90 days before it.
- **Name matching.** Names are normalised: case, accents, spacing and punctuation. Then, from
  strongest to weakest:
  1. the full name is equal;
  2. the first name and last initial match (*"Jane T."*);
  3. the first name alone matches, and only when exactly one candidate has it.
- **Timing.** A review-link click within 3 days before the review strengthens a candidate.
  Without a name match, timing alone is never enough.
- **Never suggested:** anonymous reviewers, or a pair Staff have already rejected.
- **Output.** At most three suggestions per review, each with its reason, such as
  *"full name; asked 9 days before; link clicked 1 day before"*.

### What Staff confirm

```sql
create table customer_google_reviews (
  google_review_id     uuid primary key references google_reviews(id) on delete cascade,  -- one Customer per review
  customer_id          uuid not null references customers(id) on delete cascade,
  how                  text not null check (how in ('suggestion', 'manual')),
  linked_by_profile_id uuid null references mp_staff(id) on delete set null,
  linked_at            timestamptz not null default now()
);

create table customer_google_review_rejections (
  google_review_id      uuid not null references google_reviews(id) on delete cascade,
  customer_id           uuid not null references customers(id) on delete cascade,
  rejected_by_profile_id uuid null references mp_staff(id) on delete set null,
  rejected_at           timestamptz not null default now(),
  primary key (google_review_id, customer_id)
);
```

- **Access.** Both tables are service-role only. The customer cannot read either.
- **Permissions.** Linking, unlinking and rejecting need `customers-edit` (slice 10). Each
  writes `recordAdminAction`, with ids and no review text.
- **Where Staff do it:**
  - **The Customers page → *Reviews* tab, *Google reviews to match*.** Each unlinked review
    shows its stars, display name, date and an excerpt, with its suggestions.
    - *Link* or *Not them* on each suggestion.
    - *Find customer…* searches any Customer to link manually, for reviews from people we never
      asked.
  - **The Customer detail, Reviews card.** *Possible Google review: ★5 by "Jane T." on 3 Nov:
    Link? Not them?*
- **Telegram.** The existing Google review card gains one line when a suggestion exists:
  *"Possible customer match: confirm in the Admin Panel"*, with a link and **no customer name**
  (README, third hazard).

## Overview columns and filters

`admin_customer_overview` (migration slice 12) adds:

- `review_requested_at`, `review_link_clicked_at`;
- `google_review_rating`, `google_reviewed_at` (from the linked review);
- `shop_reviews_count`, `shop_review_avg_rating`.

**The Review column** shows the strongest fact first:

- *★5 Google*;
- *★4 shop (2)*;
- *Asked 3 Nov · clicked*;
- *Asked 3 Nov*;
- *—*.

**Filters**, in slice 04's schema:

- Google review: *linked / asked, not reviewed / not asked*;
- Shop review: *yes / no*;
- Rating: *4★ and up / 3★ and below*.

So a **Segment** like *"reviewed us 5★ on Google"* is one click.

**The rule that keeps this honest.** Review data can drive any CRM list, **except** who gets a
review request. Slice 07 asks everyone eligible alike. Never filter its candidates by rating or
by whether a review exists (README, sixth hazard).

## The Reviews card (Customer detail)

- **The Google review**, when linked: stars, full text, date, whether we have replied (from
  `google_reviews.status`), and who linked it and when.
- **Shop reviews:** rating, product, status (pending, approved, rejected) and date.
- **The review request:** sent on date, and *link clicked* on date or *not clicked*.
- **Suggestions** awaiting confirmation, as above.

The timeline (slice 03) gains a *Google review* entry at the review's own date once it is
linked. Shop reviews are already on it.

## Acceptance criteria

- [ ] vitest covers `suggestGoogleReviewMatches`:
      - full name, first name plus initial, and a unique first name;
      - a shared first name gives no suggestion;
      - an anonymous reviewer gives none;
      - a rejected pair is never re-suggested;
      - a click strengthens, and timing alone never suggests.
- [ ] A Google review can be linked to at most one Customer. Linking a second time is refused
      with the current link shown.
- [ ] Nothing links a Google review without a Staff action. No code path inserts into
      `customer_google_reviews` from the sync.
- [ ] The Review column and filters match the tables, queried by hand on fixtures.
- [ ] Slice 07's candidate query has no join to `product_reviews`, `google_reviews` or
      `customer_google_reviews`. This is asserted in a check.
- [ ] `./scripts/graphify update .` is run in the same commit.
