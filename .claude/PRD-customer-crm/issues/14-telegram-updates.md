# 14 — Telegram updates: four types, each with its own switch

**Issue:** [#291](https://github.com/ivanyeors/mp/issues/291) (parent #277)
**Type:** AFK
**Blocked by:** 10. Two types start posting only when their source exists: *Google reviews to
match* after 12, and *New sign-ups* after migration slice 12.
**User stories:** 29, 30
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:email`, `area:admin`

## Decided

The owner chose the updates on 2026-10-20. There are four types, and all are on by default:

| Type | When | Example |
|---|---|---|
| **New online Result to review** | instant, on every online hold | Today's notice, unchanged: *💤 Held Result (online purchase) — review needed*, the build, the customer's email, the amount, and the link to the Result |
| **Google reviews to match** | daily, only when > 0 | *3 Google reviews are waiting to be matched to customers. Open* |
| **New sign-ups** | daily, only when > 0 | *5 customers signed up yesterday, 3 of them from Shopify. Open* |
| **Weekly summary** | weekly, Monday by default | *This week: 12 new customers, 7 sign-ups, 18 review requests (9 opened), 4 Google reviews linked, 11 follow-ups done, 2 overdue. Open* |

These are not built: *Follow-ups due*, *Follow-up assigned*, *Aftercare sent* and *Aftercare
turned off*. Adding one later takes a new settings key and a renderer, with no migration.

## Goal

Staff hear about the work that needs them in the Telegram group, and the owner switches each
kind of update on or off from the Customers page.

## Today

- **One group, one switch.**
  - Every notice goes to one Staff group, whose chat id is hardcoded (`lib/telegram/notify.ts:1-11`).
  - Only one kind of notice can be switched off: the reminder for a held Result that is still
    waiting. That switch is in Settings → General, review SLA (`results_sla_remind_telegram`,
    `lib/sla-reminders/index.ts:46`).
- **The online Result notice already exists.** `app/api/results/hold/route.ts:1080-1099` posts it
  through `sendTelegram` on every online hold, with or without a card. Nothing can switch it off.
- **In-store Results post a different notice.** When Staff finalise one, *Custom Mpillow
  created* is posted (`app/api/mp-config/responses/route.ts:448-519`). It is not an online
  Result, and it stays as it is.
- **No direct messages.** The bot replies in a direct chat only to `/link`
  (`lib/telegram/bot-api.ts:114-115`).

## The four types

### New online Result to review (instant)

- **Only the switch is new.** Before `sendTelegram`, the hold route reads
  `crm_telegram_updates.online_result_held`. When it is off, nothing is posted and the response
  reports `telegramStatus: "skipped"`.
- **The content does not change.**
  - It keeps today's wording, including the customer's email, because the build team works
    from it. The group's chat id is hardcoded for exactly that reason.
  - The counts-only rule below is for the CRM's own types, and does not rewrite this one.
- **If the settings read fails, the notice posts, as it does today.** The switch can silence the
  notice, but it can never break a hold.
- **The waiting reminder** (*⏰ Reminder: held Result still needs review*) keeps its own switch
  in Settings → General. The card shows whether it is on and links there, so there are never
  two switches for one notice.
- **Changing this type needs `results` as well as `customers-edit`.** Someone who cannot see
  Results cannot silence the Results queue.

### Google reviews to match (daily, only when > 0)

- **What it counts:** the reviews waiting in slice 12's *Google reviews to match* list.
- **Until the Google review sync is live,** that count is zero, so nothing is posted.

### New sign-ups (daily, only when > 0)

- **What it counts:** Customers whose `account_linked_at` (migration slice 12) falls on the
  previous day, in Singapore time.
- **It also says** how many of them were **Migrated customers**.

### Weekly summary (weekly)

- **What it counts,** for the previous Monday to Sunday in Singapore time:
  - new Customers and sign-ups;
  - review requests sent, and how many were opened (slice 07);
  - Google reviews linked (slice 12);
  - follow-ups done, and how many are overdue (slice 06).
- **Each line is added by the slice that owns its source,** the way timeline adapters are. So
  the summary ships with the sources that exist when this slice lands.
- **The day:** `weekly_day` picks it, and the default is Monday.

## Rules for the CRM's own types

These cover the three types above other than the online Result notice.

- **Counts, Staff names and a link only.**
  - Never a customer's name, contact details, order, or review text (README, third hazard).
  - The link opens the Admin Panel, where permissions apply.
- **A type that is off posts nothing.**
- **Scheduled types go out with the daily job** chained onto `results-sla`, at about 10:00 SGT
  (±1 hour on Vercel Hobby).
  - Each goes at most once per period, through a compare-and-set on
    `crm_telegram_last_sent[type]` (a date, or an ISO week).
  - Types that post only when > 0 stay quiet on a zero day.
- **One place for the wording.** Each type renders through one pure function in
  `lib/crm/telegram-updates.ts`, with a fixture test.

## Settings

There is one `site_settings` key, `crm_telegram_updates`, holding JSON checked by a zod schema:

```json
{
  "online_result_held":      { "enabled": true },
  "google_reviews_to_match": { "enabled": true },
  "new_sign_ups":            { "enabled": true },
  "weekly_summary":          { "enabled": true, "day": "mon" }
}
```

- **A missing type is on.** That is its default, so this slice changes nothing on deploy.
- **It is public, and safe to be.** Anyone can read `site_settings`. This key holds only on/off
  flags and a weekday, nothing private.

## Admin Panel

The Customers page gets a **Telegram updates** card in its *Settings* tab, next to slice 07's
Aftercare card. It has:

- a switch for each type, with its example line;
- the weekly day picker;
- a read-only line: *Reminder when a held Result waits too long: on. Change it in Settings →
  General.*
- **Send test.** It posts each enabled type once with sample numbers, marked **TEST**.
  - The online Result sample uses a made-up build and `test@example.com`, never a real Result.
    It includes a paired Mbolster, so the longer form is seen too.
  - The precedent is the review cards' *Send preview*.

Permissions:

- Seeing the card needs `customers`.
- Changing it needs `customers-edit` (slice 10). The online Result type also needs `results`.
- Every change writes `recordAdminAction`.

## Not in this slice

- **Direct messages to one Staff member.** These would reach only people who have started a chat
  with the bot, and would need their own rules for consent and wording.
- **The in-store and cancellation notices.** *Custom Mpillow created* and *Customer cancelled a
  build* stay as they are. The settings shape lets them join the card later.

## Acceptance criteria

- [ ] With `online_result_held` off, an online hold succeeds and posts nothing. When it is on,
      or the setting cannot be read, the hold posts exactly today's text, including the
      **Paired build** lines (*➕ Paired Mbolster…*, *Quoted:*, a second *Platform:* link). The hold route's
      existing tests pass unchanged.
- [ ] Changing the online Result type needs both `results` and `customers-edit`. With
      `customers-edit` alone, the switch is disabled and the API refuses the change.
- [ ] Each CRM type renders from fixtures to the exact example wording, with no customer name,
      contact details, order or review text. A test scans the output for the fixture customers'
      names and emails.
- [ ] A scheduled type posts at most once per period, even when the cron is re-run by hand.
      Types that post only when > 0 post nothing on a zero day.
- [ ] *Send test* posts only enabled types, each marked TEST, with no real customer data.
- [ ] `./scripts/graphify update .` is run in the same commit.
