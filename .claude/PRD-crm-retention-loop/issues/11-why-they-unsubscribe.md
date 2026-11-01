# 11 — Ask why they unsubscribe, and keep it on the Lost Customer

**Issue:** [#352](https://github.com/ivanyeors/mp/issues/352)
**Type:** AFK, then HITL (the owner on the answer wording)
**Status:** **built** (2026-11-01); the owner approved the answer wording (2026-11-01)
**Blocked by:** 03 (the *Lost* stage)
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`

## Goal

When someone unsubscribes, we learn why, as the owner asked (2026-10-28: "with users clearly
pressing unsubscribe, we should ideally trigger a final feedback workflow from them and mark
their stage as lost"). The demo: a customer unsubscribes from a campaign email, answers *Too many
emails* on the page that confirms it, and the Customer detail shows *Lost · Too many emails*.

## The rules

- **Ask after, never before.** The unsubscribe takes effect first, as it does now. The question
  appears on the confirmation (*You're unsubscribed*) and is optional. Nothing about it may delay,
  block or undo the unsubscribe: Singapore's Spam Control Act and Gmail's and Yahoo's sender rules
  require an unsubscribe to work with no further step.
- **Where it is asked.** The unsubscribe page (`/[lang]/unsubscribe`), after the button; and the
  account's *Email me news and offers* toggle, when turned off. Staff unsubscribing someone on
  request (source `support`) can record the reason they gave.
- **Where it is not.** Gmail's and Yahoo's own *Unsubscribe* button (RFC 8058 one-click) never
  opens our page, so those people are not asked. No email is sent afterwards to ask: a message
  after unsubscribing reads as more marketing and invites spam complaints. If the owner wants one,
  it is a counsel question, as slice 10 part 2's is.
- **A spam complaint** (source `complaint`) is *Lost* with no reason, and is never asked.

## Answers (draft for the owner)

One closed question, *Mind telling us why?*, in a random order with *Other* last: *Too many
emails*, *Not relevant to me*, *I have the pillow I need*, *I wasn't happy with my pillow*, *I
never signed up for these*, *Other* (an optional line, up to 500 characters). No answer offers a
discount or asks them to stay.

## What to build

- **Storage**: one row per unsubscribe event, server-only (RLS on, no policy): the Customer, the
  consent event it answers, the reason, the optional text, the time. Unlike a **Drop-off
  reason**, it is kept on the Customer, because the person is known and is told so.
- **The endpoint** takes the signed unsubscribe link's `u` and `t` (or the signed-in Customer),
  JSON only, validated with zod, rate-limited as the drop-off endpoint is, and records the answer
  only for a Customer who is now `unsubscribed`.
- **On the Customer detail**: *Lost* with the reason and the date beside the stage.
- **On Analytics**: *Why people unsubscribe* beside *Why people leave*, by reason for 30, 90 and
  365 days, with the latest typed answers (Staff only).
- **`CONTEXT.md`**: **Unsubscribe reason**.

## As built (2026-11-01)

- **Migration** `20261101081458_unsubscribe_reasons.sql`: `customer_unsubscribe_reasons`
  (server-only; unique on the consent event it answers; words only with *Other*, up to 500
  characters) and `record_unsubscribe_reason(customer, reason, text)`, which records an answer
  for the Customer's latest consent change only while they are unsubscribed and that change was
  the link, their account or Staff. It answers `recorded`, or why not (`already`,
  `not_unsubscribed`, `complaint`, `not_asked`, `not_found`), and never writes consent.
- **The unsubscribe page** asks once they are unsubscribed, when their latest unsubscribe has no
  answer: one tap, or *Other* and an optional line; then a thank-you. It posts to
  `POST /api/email/unsubscribe/reason` with the same signed link (`u`, `t`, a campaign's `s`):
  JSON only, zod, 10 an hour per address, 409 when there is nothing to answer.
- **The account**: turning *Email me news and offers* off asks the same question
  (`answerMyUnsubscribeReason`, the session's Customer only).
- **Staff**: the Marketing email card's *Unsubscribe* dialog has an optional *Why did they ask?*;
  the support route records it after the unsubscribe, and a failure is logged, never an error.
  The card's history shows each answer under the unsubscribe it answers.
- **The Customer page**: *Lost · Unsubscribed 7 Oct 2026 · Too many emails*.
- **Analytics**: *Why people unsubscribe* beside *Why people leave*: unsubscribes by how
  (link, account, Staff, spam report), how many told us why, the reasons, and the latest typed
  answers, for 30, 90 and 365 days.
- **Tests:** `supabase/tests/crm/assert-11-unsubscribe-reasons.sql`; the route, the account
  action, the support route, and the reasons module (`lib/marketing-consent/__tests__`).
- **Owner:** the six answers are the draft above; change their words in
  `lib/marketing-consent/unsubscribe-reasons.ts` (the keys stay).

## Acceptance criteria

- [x] An unsubscribe takes effect whether or not the question is answered, and before it is
  shown.
- [x] A one-click unsubscribe is honoured and asks nothing.
- [x] An answer is stored only for a Customer who is unsubscribed, at most once per unsubscribe.
- [x] No answer offers a discount.
