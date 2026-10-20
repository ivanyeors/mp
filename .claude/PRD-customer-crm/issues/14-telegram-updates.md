# 14 — CRM updates on Telegram: a catalogue of update types, each with its own switch

**Type:** AFK
**Blocked by:** 06; owner decision 2 (confirm the catalogue and its defaults)
**User stories:** 29, 30
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:customers`, `area:telegram`

## Status

This is a draft catalogue. The owner wants to define exactly which updates the CRM posts
(owner, 2026-10-20). The table below is the proposal to react to. Each row can be kept, cut
or changed before this slice is built.

## Goal

Staff learn about CRM work in the Telegram group without opening the Admin Panel, and the
owner chooses which kinds of update the CRM posts.

## Today

- **One group, no switches.** All notices go to one Staff group (`MP_CONFIG_TELEGRAM_CHAT_ID`,
  `lib/telegram/notify.ts:11,38-53`). The code posts them, and there is no switch per kind of
  notice.
- **No direct messages.** The bot replies in a direct chat only to `/link`
  (`lib/telegram/bot-api.ts:114-115`).

## Rules for every CRM update

- **Counts, Staff names and a link only.**
  - Never a customer's name, contact details, order, or review text (README, third hazard).
  - The link opens the Admin Panel, where permissions apply.
- **Each type has its own switch.** A type that is off posts nothing.
- **Scheduled types** go out with the daily job chained onto `results-sla` (about 10:00 SGT,
  ±1 hour on Vercel Hobby).
  - Each goes at most once per period, through a compare-and-set on
    `crm_telegram_last_sent[type]` (a date, or an ISO week).
  - "Only when > 0" types stay quiet on a zero day.
- **Instant types** fire from the write that causes them. They are best-effort and never block
  or fail that write.
- **One place for the wording.** Every type renders through one pure function in
  `lib/crm/telegram-updates.ts`, with a fixture test, so the wording is reviewed in one place.

## Proposed catalogue (owner to confirm)

| # | Type | When | Example | Proposed default |
|---|---|---|---|---|
| 1 | **Follow-ups due** | daily | *Follow-ups today: Ivan 2 (1 overdue) · Mei 1. Open list* | on |
| 2 | **Follow-up assigned** | instant | *New follow-up for Mei, due Fri 24 Oct. Open* | on |
| 3 | **Google reviews to match** | daily, only when > 0 | *3 Google reviews are waiting to be matched to customers. Open* | on |
| 4 | **Aftercare sent** | daily, only when > 0 | *Yesterday: 4 review requests (4 email, 2 WhatsApp), 1 check-up. 2 orders still not marked delivered. Open* | off |
| 5 | **Aftercare turned off** | daily, only when > 0 | *2 customers turned off aftercare messages yesterday (1 by WhatsApp STOP). Open* | off |
| 6 | **New sign-ups** | daily, only when > 0 | *5 customers signed up yesterday, 3 of them from Shopify. Open* | off |
| 7 | **Weekly summary** | weekly, on a chosen day | *This week: 12 new customers, 7 sign-ups, 18 review requests (9 opened), 4 Google reviews linked, 11 follow-ups done, 2 overdue.* | on, Monday |

Types 1 and 2 replace the morning digest that slice 06 first described.

## Settings

There is one `site_settings` key, `crm_telegram_updates`, holding JSON checked by a zod schema:

```json
{ "follow_ups_due": { "enabled": true }, "follow_up_assigned": { "enabled": true }, "...": {}, "weekly_day": "mon" }
```

- A type missing from the JSON takes its default, so adding a type later needs no migration.
- `site_settings` can be read by anyone. It holds only on/off flags and a weekday here, nothing
  private.

## Admin Panel

The Customers page gets a **Telegram updates** card in a *Settings* tab, next to slice 07's
Aftercare card.

- A switch per type, with its example line.
- The weekly day picker.
- **Send test**, which posts each enabled type once with sample numbers, marked **TEST**. The
  precedent is the review cards' *Send preview*.
- Seeing the card needs `customers`. Changing it needs `customers-edit` (slice 10). Changes
  write `recordAdminAction`.

## Not in this slice

- **Direct messages to one Staff member**, for example *"your follow-ups today"*. This is
  possible only for people who have started a chat with the bot, and it needs its own consent
  and wording rules.
- **Results, Orders and other Admin Panel areas** joining the same switchboard. The settings
  shape allows it, but this slice covers CRM types only.

## Acceptance criteria

- [ ] Each type renders from fixtures to the exact example wording, with no customer name,
      contact, order or review text. A test scans the output for the fixture customers' names
      and emails.
- [ ] A type that is off never posts. A scheduled type posts at most once per period, even when
      the cron is re-run by hand.
- [ ] "Only when > 0" types post nothing on a zero day.
- [ ] An instant type's failure does not fail the follow-up write it rides on.
- [ ] *Send test* posts only enabled types, each marked TEST.
- [ ] `./scripts/graphify update .` is run in the same commit.
