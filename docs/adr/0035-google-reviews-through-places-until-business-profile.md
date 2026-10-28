# Google reviews reach Telegram through the Places API until the Business Profile API is approved

Status: Accepted (2026-10-27)

## Context

Google review cards (PRD-google-review-replies) were built on the Business Profile API: it lists
every review, reports our reply, and posts one, so **Post reply** publishes from Telegram the way
Facebook, Instagram and TikTok replies go out. It has no per-call charge, but Google must approve
the Cloud project first (quota 0 until then), and `GOOGLE_BUSINESS_LOCATION` can only be found once
it has. Production never had it: `google_reviews` held no rows, and nothing said why, because the
sync returns `skipped: "not_configured"` without an error.

The owner asked to use the Places API, which is already configured for the landing page, and to
stay inside its free monthly allowance. The Places API differs in ways that shape the design:

- **Read-only.** No reply endpoint, and the Review object has no owner reply.
- **Five reviews, by relevance.** Place Details (New) returns "up to 5 reviews, sorted by
  relevance". It has no "newest" sort, and the legacy API that had one can no longer be enabled.
  A new review can be missing from the five.
- **Billed.** Asking for `reviews` bills as Place Details Enterprise + Atmosphere: 1,000 free a
  month, then US$25 per 1,000. The landing page's read shares that allowance.
- **Not ours to keep.** Places policy: no pre-fetching, caching or storing of content beyond the
  allowed exceptions. Only place IDs may be kept indefinitely.

## Decision

- **Both sources feed the one inbox.** `google_reviews.source` is `business_profile` or `places`.
  Places reviews are mapped into the Business Profile shape and go through the same sync: same
  rows, same reply types and Claude drafts, same notify window, same reopening on a reply-type
  change.
- **Places cards are answered on Google Maps.** A `places` card links to the review
  (**Open on Google Maps**) and offers **Mark replied** (records the draft on screen as what was
  posted, by whom) and **Skip**, never **Post reply**. Post refuses a `places` row.
- **Weekly, capped, counted before the call.** The poll is chained onto the daily `results-sla`
  cron and reads only when its last successful read is a week old (less an hour). That is 4–5
  reads a month. `google_places_polls` counts reads per calendar month and refuses a read at the
  cap (60 by default, `GOOGLE_PLACES_POLL_MONTHLY_CAP`, never above 500) before it is made, guarded
  on the count it read. A failed read still counts.
- **Reviews the five don't show are still announced.** The same read returns `userRatingCount`
  (no extra charge). When the count rises by more than the reviews newly seen, the group gets a
  note with a link to answer them on Google Maps.
- **Places content is kept 30 days at most.** Places rows are deleted 30 days after they are
  stored, and an open card is edited to close without quoting the review. A review seen again
  after that is past the 14-day notify window, so it is stored as `backlog` with no new card. A
  Staff-confirmed customer match on such a row (`customer_google_reviews`) is deleted with it.
- **The Business Profile API takes over by itself.** With `GOOGLE_BUSINESS_*` set, the Places poll
  stands down. The Business Profile sync adopts each Places row it can match (same reviewer name,
  created within two minutes): it renames and re-sources the row, keeping its card, draft, status
  and customer match, and the card swaps Mark replied for Post reply.
- **The landing page reads Places once a week.** `PLACE_REVIEWS_REVALIDATE_SECONDS` is seven days:
  a reused response, never a stored copy.
- **The Telegram tab shows both.** Users & permissions → Telegram → Google Maps reviews checks the
  Business Profile side live (free) and names what is missing: env, the token, approval, the
  location (with the values to choose from), Pub/Sub. It shows the Places reads used this month
  from the poll table, never spending a billed read on a status check.

## Consequences

- Until approval, replies are pasted on Google Maps by hand, and new reviews can take up to a week
  to reach the group.
- A review outside Google's five reaches the group only as the count note, with no card and no
  draft.
- The landing page cannot collect a growing set of 4–5★ reviews from Places: storing them is not
  allowed. Once the Business Profile API is connected, those reviews are the business's own data
  and could feed it from `google_reviews`.
- Billed Places reads stay under about 10 a month: the poll plus the landing page's weekly read
  per cache key.
