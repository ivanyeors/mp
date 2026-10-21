# 12 — Reviews on every Customer: shop reviews, review requests, and Google reviews matched by Staff

**Issue:** [#289](https://github.com/ivanyeors/mp/issues/289) (parent #277)
**Type:** AFK, plus one HITL dependency (the Google review sync must be live)
**Status:** built in `0f3d5df` on `claude/shopify-migration-plan-izv7fo`
**Blocked by:** 04, 07, 10
**User stories:** 21, 22, 23
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`

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

**A name is not an identity**, so a Google review is never linked automatically (ADR 0028 k).
Two customers can share a name. A display name like *"Jane T."* or a nickname may match nobody,
or match the wrong person.

## The Google side depends on the review sync being live

`google_reviews` fills only once Google approves Business Profile API access and the refresh
token and location are set (`.claude/PRD-google-review-replies/OPS-CHECKLIST.md`, steps 1–4).
The daily catch-up chained on `results-sla` (`syncGoogleReviews`) then fills it; Pub/Sub (step 6)
only makes it real-time.
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

- [x] vitest covers `suggestGoogleReviewMatches`:
      - full name, first name plus initial, and a unique first name;
      - a shared first name gives no suggestion;
      - an anonymous reviewer gives none;
      - a rejected pair is never re-suggested;
      - a click strengthens, and timing alone never suggests.
- [x] A Google review can be linked to at most one Customer. Linking a second time is refused
      with the current link shown.
- [x] Nothing links a Google review without a Staff action. No code path inserts into
      `customer_google_reviews` from the sync.
- [x] The Review column and filters match the tables, queried by hand on fixtures.
- [x] Slice 07's candidate query has no join to `product_reviews`, `google_reviews` or
      `customer_google_reviews`. This is asserted in a check.
- [x] `./scripts/graphify update .` is run in the same commit.
- [ ] The Google side works on real synced reviews: suggestions, *Link*, the Telegram line — _not
      yet: HITL, needs the Google review sync live (`PRD-google-review-replies/OPS-CHECKLIST.md`,
      steps 1–4)_

## Build notes

Built on `claude/shopify-migration-plan-izv7fo` @ `2c472f6` (CRM 03, 04, 06, 07, 10, 11, 13 and
14 merged), then merged with it again @ `d9c6368` (CRM 05 and migration slice 07).

**What was built**

- **Matching, pure:** `lib/crm/review-match.ts`. `suggestGoogleReviewMatches(review,
  candidates)` applies the windows (asked within 45 days, delivered within 90, a click within 3
  strengthens), the three name rules, and the *never* rules (anonymous, rejected, already linked
  elsewhere); at most three, each with its reason. `nameTokens` normalises case, accents, spacing
  and punctuation. Full name matches in either order (*Tan Mei Ling* is *Mei Ling Tan*).
- **Reads:** `lib/crm/google-review-match-server.ts`. *Google reviews to match*, the Reviews tab
  (`readReviewTab`), the Customer's Reviews card (`readCustomerReviews`), the Telegram card's
  link (`possibleCustomerMatchLink`, never throws), and the counts. Reads are paged past
  PostgREST's 1000-row limit.
- **Writes, the only ones:** `lib/crm/google-review-links.ts` (link, unlink, *Not them*), each one
  SQL function, called only from three `customers-edit` routes, each audited with ids and no
  review text:
  - `POST|DELETE /api/settings/customers/google-reviews/[reviewId]/link` (409 with `current` on
    a second link);
  - `POST /api/settings/customers/google-reviews/[reviewId]/rejections`.
- **Reads routes (`customers`):** `GET /api/settings/customers/google-reviews?scope=&page=` and
  `GET /api/shop/customers/[id]/reviews`.
- **Admin Panel:**
  - Customers → **Reviews** tab (`?view=reviews`, `reviews-tab.tsx`): *To match* and *All
    unlinked*, each review with its stars, name, date, excerpt and reply state, its suggestions
    with *Link* / *Not them*, and *Find customer…* (the list's own search) to link by hand;
  - the **Reviews card** on the Customer detail (`[id]/customer-reviews-card.tsx`): the linked
    Google review in full with reply state and who linked it (*Unlink*), shop reviews with
    product and status, the review request (asked on, by which channel, clicked or not), and
    *Possible Google review: ★5 by "Jane T." on 3 Nov: Link? Not them?*;
  - the **Review column** on the list (strongest fact first, the rest muted) and three filters in
    the Filters panel: *Google review* (linked / asked, none linked / not asked), *Shop review*
    (yes / no), *Rating* (5★ / 4★ and up / 3★ and below). Shared parts:
    `review-match-parts.tsx`.
- **Seams filled:** `countGoogleReviewsToMatch` (CRM 14), `WEEKLY_SUMMARY_SOURCES` gains
  `googleReviewsLinked` (only in a week with any), `countLinkedGoogleReviewsOfRequested` (CRM 07's
  Aftercare card, now *"…linked to a customer we asked, so far: N"*).
- **Telegram:** `renderGoogleReviewCard(row, { possibleCustomerMatch })` adds *"👤 Possible
  customer match: confirm in the Admin Panel: <link>"* while a suggestion exists, with no name.
  The sync (first send and refreshes) and the Telegram handler's re-render compute it.
- **Timeline:** `lib/crm/timeline/sources/google-reviews.ts`, kind `google_review.written`, under
  the Reviews chip, at the review's own date once linked; stars and reply state, no text.

**Migrations**

- `20261020134000_customer_google_reviews.sql`: the two tables as specified (plus indexes on
  `customer_id` and `linked_at`); `crm_name_tokens()` (the SQL twin of `nameTokens`);
  `google_review_match_candidates(review ids, customer)`; `link_google_review()`,
  `unlink_google_review()`, `reject_google_review_match()`; the view
  `admin_google_reviews_unlinked`. All server-only: RLS on, no policy, revoked from anon and
  authenticated; the functions run for the service role only.
- `20261020200500_customer_overview_reviews.sql`: `admin_customer_overview` redefined with every
  column of `20261020200400` (migration slice 07's `marketing_email` and
  `marketing_email_updated_at` included) plus `review_requested_at`, `review_link_clicked_at`,
  `google_review_rating`, `google_reviewed_at`, `shop_reviews_count`, `shop_review_avg_rating`,
  and `review_rating`.

**Database check** (`mp_c12`, Postgres 16 with the Supabase stubs): every migration applies.
With fixtures, in psql:

- candidates: Jane asked 9 days before (her WhatsApp send, the earlier), the two Bobs delivered 20
  days before a review signed "Bob", José matched across accents, Jane Old's 200-day-old delivery
  and the anonymous review left out; one Customer's call returns the other candidates of the
  same review;
- `link_google_review` links once; a second call (another Customer) changes nothing and returns
  the holder; a bad `how` and an unknown Customer are refused; linking a rejected pair clears the
  rejection; unlinking records the pair as rejected, and a second unlink returns false; *Not
  them* on a linked pair returns `linked`;
- a deleted Google review takes its link with it; a deleted profile nulls `linked_by`; the only
  trigger on `google_reviews` is `updated_at`;
- anon and authenticated can read neither table nor the view, and can run none of the functions;
  service_role can;
- the overview's seven columns, and every Review filter as `applyCustomerFilters` sends it,
  against the tables: *Google review* partitions all 7 fixture Customers; Nora (claimed, email
  failed) is not asked; *rating=5* is Jane (Google 5) and Bob Lee (shop 4 and 5); *reviewed us 5★
  on Google* is Jane alone.

**Tests added**

- `lib/crm/__tests__/review-match.test.ts`: every case of the first criterion, plus ordering, the
  cap of three, either name order, and the separators matching the SQL.
- `lib/crm/__tests__/google-review-match-server.test.ts`, with an in-memory stand-in for the SQL
  (`google-review-fake.ts`): the to-match list and count, paging, link once and show the holder,
  unlink and reject, the Telegram link naming nobody, the Reviews card before and after a link,
  the counts and the Review column's facts.
- `lib/crm/__tests__/google-review-links-guard.test.ts`: one SQL insert into
  `customer_google_reviews`, inside `link_google_review`; no trigger writes it; the functions run
  for the service role only; one app module calls it, imported only by `customers-edit` routes;
  and nothing the sync, its webhook, either cron, the Telegram handler or the backfill script
  imports reaches that module (`import-closure.ts`).
- The sixth hazard's check, extended in `lib/aftercare/__tests__/review-request.test.ts`: every
  file the review-request job reaches through its imports reads no review table, embeds none in a
  select, calls no matching function, and never reads the Customer overview or its review
  columns.
- `app/api/settings/customers/__tests__/google-reviews-routes.test.ts`: permissions (see on
  `customers`, change on `customers-edit`), 409 with the holder, audit with ids only, manual
  links, *Not them*, unlink.
- `app/[lang]/settings/customers/__tests__/reviews-render.test.tsx`: the column, the filters in the
  panel, the tab, and the card with and without `customers-edit`.
- Extended: the filters (`customer-filters.test.ts`), the Telegram job's weekly summary, the card
  line (`cards.test.ts`), the sync (`google-sync.test.ts`), the timeline route fixture, the write
  guard's list, and three list fixtures for the new overview columns.
- The shared fake admin (`lib/supabase/__tests__/fake-admin.ts`) now applies every `order` as a
  further sort key, as PostgREST does (it kept only the last); `range` is CRM 05's.

**Deviations**

- **`review_rating`, a seventh overview column.** The Rating filter must read one value; without
  it, "4★ and up" would need an `.or()` across the Google and shop columns (ADR 0028 (d)). It is
  the linked Google rating, else the shop average rounded, and it is what the column shows.
- **A *5★* rating value**, beside *4★ and up* and *3★ and below*, so *"reviewed us 5★ on
  Google"* is exactly one link (`google_review=linked&rating=5`).
- **The *Google review* filter is a partition.** *Not asked* means neither asked nor linked, so
  each Customer is in exactly one value.
- **Shop reviews count whatever their moderation status**: the customer wrote them. The card
  shows the status.
- **What *Google reviews to match* counts.** The list (and the daily Telegram update) is the
  unlinked reviews with at least one suggestion. Every other unlinked review (anonymous, never
  asked, backlog) is on the tab's *All unlinked* list with *Find customer…*, and is not counted:
  otherwise the update would post every day for years-old reviews nobody can match.
- **A first name is unique among every candidate in the windows, rejected ones included**: a name
  two people share stays ambiguous after Staff rule one out.
- **Unlinking also records *Not them*** for that pair, so it is not suggested again; linking the
  pair by hand later clears it.
- **A Customer already linked to another review is not suggested** (one review per Google
  account); they can still be linked by hand.
- **Candidates come from SQL, prefiltered by a shared name token** (`crm_name_tokens`), so the
  rows stay small without a name-blind 1000-row read; the pure function still decides, and every
  rule it has needs a shared token.
- **The Aftercare card's count is all-time**, and counts Customers (one review per Google
  account), so its wording says *so far*.

**Left for ops or the owner**

1. Apply the two migrations.
2. The Google side needs the Google review sync live (OPS-CHECKLIST steps 1–4). Until then the
   tab lists nothing, the column shows *Asked* and *Clicked* only, and the daily update posts
   nothing.
3. Once reviews sync, check a few suggestions by hand before trusting the daily update.
