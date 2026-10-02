# PRD: Google review replies through Telegram

Status: Built (needs Google Business Profile API approval + ops setup — see `OPS-CHECKLIST.md`)

## Problem Statement

Google Maps reviews are where most prospects meet Mpillow before they visit, but replying is manual
and uneven: some reviews never get an answer, and the ones that do are often generic. A specific,
warm reply to a happy customer — and a calm, accountable one to an unhappy customer — is what
future readers use to decide whether to trust the business and book a fitting.

Website (shop) reviews arrive `pending` and sit unseen until someone opens Products in the back
office.

Staff already live in one Telegram group — the measurements group, where configurator submissions
are posted — so that is where review work should land.

## Solution

1. **Google → inbox.** Google Business Profile publishes `NEW_REVIEW` / `UPDATED_REVIEW` to a Cloud
   Pub/Sub topic; a push subscription calls `/api/webhooks/google-reviews`. The endpoint acks at
   once and runs a sync that re-reads the newest reviews from Google (the payload is never trusted)
   and stores them in `google_reviews`. A daily catch-up runs from the `results-sla` cron, because
   Pub/Sub delivery is not guaranteed.
2. **Claude drafts.** Each new review gets a reply drafted by Claude (Claude Opus 5.5, effort
   `medium`, server-side refusal fallback on). The **reply type** is chosen from the star rating in
   code (`lib/reviews/reply-style.ts`) and named in the request:
   - **Thank-you** (4–5★): thank them specifically, one soft invitation to book a fitting.
   - **Constructive** (3★, or no rating): acknowledge what fell short, invite direct contact, no
     selling.
   - **Service recovery** (1–2★): a sincere apology naming the specific problem, ownership (no
     excuses, never disputing their account), the impact on them acknowledged, one concrete next
     step from what Mpillow actually does (a re-adjustment visit for fit or comfort, a stuffing
     check under the 10-year warranty for wear, the team looking into it personally for anything
     else), and **always** a request to message us on WhatsApp at the staffed support number
     (`lib/contact.ts` — never the automated appointment sender). No promotion, no promised
     outcome, and no refunds, freebies or compensation in public.

   Every type forbids links / phone numbers / incentives (Google rejects promotional replies) and
   treats the review text as data, not instructions. The card flags 1–2★ reviews with a
   **SERVICE RECOVERY** line so someone also follows up with the customer personally, and warns
   if any reply promises a refund or compensation, or if a recovery reply (Claude's or a
   person's) does not give the WhatsApp number. That number is the one phone number a reply may
   carry without a warning.
3. **Telegram card.** The review and draft are posted to the measurements group as a **Review
   card** headed `⭐ GOOGLE MAPS REVIEW`, with **Post reply / Redraft / Skip**. Website reviews get a
   `🛍 SHOP REVIEW · mpillow website` card with **Approve / Reject** and no reply affordance.
4. **Staff decide.** A review manager taps Post to publish the draft exactly as shown, or replies
   to the card with their own wording (which replaces the draft — Post is still required). Every
   card re-renders after each change and loses its buttons once someone has acted.
5. **RBAC.** Staff Management → **Telegram access** (owners/admins only) lists who may press the
   buttons, with a role each: **Review manager** (Google replies + shop moderation) or **Shop
   moderator** (shop only). People bind their Telegram account by sending `/link CODE` (a one-time
   code from that tab) to the bot.
6. **Preview.** **Send preview** on the same tab (or `scripts/telegram-review-preview.ts`) posts
   sample cards of every kind to the group, rendered by the production card code and marked
   PREVIEW. Their buttons carry an id that matches no review, so a tap only runs the permission
   check and answers with the tapper's access — nothing is stored or posted.

## User stories

1. As a prospect reading Google reviews, I see a specific, human reply under most reviews, so I
   trust the business enough to book a fitting.
2. As a review manager, I get a card in the measurements group within a minute of a new Google
   review, with a draft I can post in one tap.
3. As a review manager, I can reword the reply by replying to the card, and post my version.
4. As a review manager, I can ask for another draft (Redraft) or decide not to reply (Skip).
5. As a review manager, I can trust that Post publishes exactly the text on my screen — a draft
   changed by a colleague a moment earlier is refused, not posted.
6. As a team, we never double-post: the second tap on Post is told someone already dealt with it.
7. As a shop moderator, I can approve or reject website reviews from the same group.
8. As an owner/admin, I decide who can do what from Settings, and can switch people off or unlink
   them at any time; every change is in the audit log.
9. As anyone in the group who is not set up, tapping a button tells me how to get access and shows
   my Telegram ID; chatting under a card does nothing.
10. As the business, a reply never contains links, phone numbers, discounts or personal details
    unless a person deliberately types them — and the card warns when it does.
11. As an unhappy 1–2★ reviewer, I get a reply that apologises for my specific problem, offers a
    real next step and tells me how to reach the team — not a thank-you or a sales pitch.
12. As a review manager, if a reviewer edits a 5★ review down to 2★ before we reply, the open
    card's draft is replaced with a service-recovery one (my own wording is never overwritten).
13. As a review manager, if a reviewer changes their rating into another reply type after we
    answered — 5★ down to 2★, or 2★ back up to 5★ after a recovery — the review comes back as a
    fresh card showing our current reply on Google, with a draft that acknowledges the change;
    **Replace reply** swaps ours for it.

## Implementation decisions

- **Two Google APIs, two jobs.** The landing page keeps using the Places API (read-only top five).
  Replies need the Business Profile API: v4 `accounts.locations.reviews` (list / get / reply), plus
  Account Management, Business Information (to find the location) and Notifications (Pub/Sub).
  Access is gated by Google's Business Profile API application; until approved, quota is 0.
- **Auth.** OAuth refresh token for sg@mpillow.com with `business.manage`, on the existing OAuth
  client — one refresh token per job (`GOOGLE_BUSINESS_OAUTH_REFRESH_TOKEN`), as with Drive.
- **Push auth.** A shared secret in the push endpoint URL (`?token=GOOGLE_REVIEWS_PUSH_TOKEN`).
  Because the handler only triggers a re-read of Google, a forged delivery can at most cause an
  extra read.
- **Idempotency and races.** Rows are unique on the review resource name. Every state change is a
  guarded update on `status` (and on `draft_version` where the draft matters): `new → pending`
  claims the card send; `pending → posting` claims the Google call; a Post carries the draft
  version it was rendered with. A card whose send failed, or a post that died mid-flight, is
  recovered by the next sync after 10 minutes.
- **Flood control.** Reviews older than 14 days when first seen are stored as `backlog` with no
  card; reviews already answered on Google are `replied_elsewhere`; at most 10 cards per sync (3
  from the daily cron).
- **Telegram.** Cards are pinned to `MP_CONFIG_TELEGRAM_CHAT_ID` like every other notice to that
  group. Review updates are routed before the inventory bot's `TELEGRAM_ALLOWED_CHATS` check —
  they have their own stricter gate — and handled after the 200 so a slow redraft never makes
  Telegram retry. Bots in privacy mode still receive button taps and replies to their own
  messages, which is all the card flow needs.
- **Link codes.** 8 characters from an unambiguous alphabet, single use, 72-hour expiry, stored
  only as a sha256; `/link` attempts are rate-limited per Telegram user.

## Reopening

A settled review — `posted`, `skipped`, `replied_elsewhere` or `backlog` — whose rating moves into
another reply type goes back to `new` with `reopened_at` and `reopened_from_rating` set
(migration `20261002070000_google_review_reopen.sql`), and is carded again like a new review: a
fresh card (the old one is edited to point at it), a draft written with the previous rating and
the reply currently on Google as context, and Post labelled **Replace reply** because Google's
reply endpoint replaces the existing reply. Edits within the same reply type (5★ → 4★, 1★ → 2★)
do not reopen. A review we have never stored is carded if it was edited after its reply within
the notify window (its earlier rating is unknown), and the notify window runs from a review's
last change, so an old review its author just edited counts as fresh.

## States (`google_reviews.status`)

`new` (stored, no card) → `pending` (card waiting) → `posting` → `posted`; `pending → skipped`;
`pending → replied_elsewhere` (a reply appeared on Google that is new since we last looked and not
ours); `backlog` (last changed outside the notify window when first seen); settled states →
`new` on a reopen.

## Out of scope (v1)

- Drafting replies for `backlog` reviews in bulk.
- Public replies to shop reviews (`product_reviews` has nowhere to show one).
- Editing or deleting a reply after it is posted (reply again from the Business Profile).
- A settings page listing review history (Telegram is the inbox; rows are in `google_reviews`).
