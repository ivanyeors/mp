# 03 — Reply to a Google review from the Reviews tab

**Issue:** not filed
**Type:** AFK, then HITL
**Status:** **built** (2026-11-15)
**Blocked by:** 01
**Labels:** `enhancement`, `area:admin`

## Goal

From a Linked Google review to a reply on Google in one copy and one press. The demo: a 1★
review shows a suggested service-recovery reply; *Copy reply*, *Open this review on Google*,
paste, post, *Mark replied*.

## What to build

- The Reviews tab shows, on each Linked Google review: the suggested reply (the draft the
  Telegram card already holds, when there is one), *Copy reply*, *Open this review on Google*,
  *Redraft*, and *Mark replied*.
- **Open this review on Google** uses the review's own `maps_uri` when Places gave one, else the
  shop's reviews page (`googleReviewsUrl()`), and says which.
- **Redraft** calls `draftReviewReply` (the same prompt and rules as Telegram). For a review
  still waiting in Telegram the new draft is saved and the card there is refreshed, so both
  places show one draft. For any other review it is returned and not saved.
- **Mark replied** is for a Places review (Google gives us no way to see the reply): it records
  the text Staff copied as what was posted, who marked it, and closes the Telegram card if one
  is open. A Business Profile review needs no button: the sync reads the reply from Google.
- Both routes need `customers-edit` and write the Audit Log with ids only.

## As built (2026-11-15)

- `LinkedGoogleReview.answer` (`lib/crm/reviews.ts`), filled by `googleReviewAnswer` in
  `lib/crm/google-review-match-server.ts`: the draft, the reply on record, the link and whether
  it opens the review itself, and whether *Mark replied* applies (`lib/reviews/mark-replied.ts`).
- `lib/reviews/admin-reply.ts`: `redraftReviewReply` and `markReviewRepliedByStaff`, each a
  guarded update that redraws an open Telegram card. *Mark replied* accepts a Places review in
  `new`, `pending`, `backlog` or `skipped`.
- Routes: `POST /api/settings/customers/google-reviews/[reviewId]/draft` and `…/replied`.
- **Nothing is suggested until Staff press *Generate reply suggestion*** (owner, 2026-11-15):
  opening the tab never calls Claude. The first press shows the draft the Telegram card already
  holds, when there is one, so both places start from the same words; with none, and on every
  *Generate again*, Claude drafts one through the API. A draft a review manager wrote in Telegram
  is never replaced from here.
- Then: the reply in an editable box, the reply-rule warnings under it, *Copy reply*, *Open this
  review on Google* (or *Open our reviews on Google*) and *Mark replied*. A reply on record shows
  to everyone, with nothing to press.
- A review entry on the Journey that is not answered has *Reply to this review*, which opens the
  Reviews tab.
- **Tests:** `lib/reviews/__tests__/admin-reply.test.ts`, `reviews-render.test.tsx`.

## Acceptance criteria

- [ ] No reply is ever posted to Google by the platform from this page.
- [ ] A draft that breaks the reply rules (`checkReplyText`) is refused, as in Telegram.
- [ ] *Mark replied* twice is refused the second time.
- [ ] Without `customers-edit` the review reads as before, with no buttons.

## HITL

- [ ] The per-review link opens the review with Reply available to the owner account.
- [ ] Confirm whether a Linked Places review should be kept past the 30 day Places retention.
