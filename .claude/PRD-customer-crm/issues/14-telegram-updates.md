# 14 — Telegram updates: four types, each with its own switch

**Issue:** [#291](https://github.com/ivanyeors/mp/issues/291) (parent #277)
**Type:** AFK
**Status:** built in `a299f53` on `claude/shopify-migration-plan-izv7fo`
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

- [x] With `online_result_held` off, an online hold succeeds and posts nothing. When it is on,
      or the setting cannot be read, the hold posts exactly today's text, including the
      **Paired build** lines (*➕ Paired Mbolster…*, *Quoted:*, a second *Platform:* link). The hold route's
      existing tests pass unchanged.
- [x] Changing the online Result type needs both `results` and `customers-edit`. With
      `customers-edit` alone, the switch is disabled and the API refuses the change.
- [x] Each CRM type renders from fixtures to the exact example wording, with no customer name,
      contact details, order or review text. A test scans the output for the fixture customers'
      names and emails.
- [x] A scheduled type posts at most once per period, even when the cron is re-run by hand.
      Types that post only when > 0 post nothing on a zero day.
- [x] *Send test* posts only enabled types, each marked TEST, with no real customer data.
- [x] `./scripts/graphify update .` is run in the same commit.

## Build notes

Built on `0ae10de` (CRM 01 and CRM 10 merged).

**What was built.**

- `lib/crm/telegram-updates.ts` (pure): the `crm_telegram_updates` zod schema and parser (each
  type read on its own; missing or malformed is on), the patch schema, the Singapore-time periods
  (yesterday; the previous Monday to Sunday keyed by ISO week), the compare-and-set step for
  `crm_telegram_last_sent`, one renderer per type, and the *Send test* samples.
- `lib/crm/telegram-update-sources.ts`: the counts. Every query is `head: true`, so no row that
  names a customer is ever read. Holds the two seams and `WEEKLY_SUMMARY_SOURCES` (below).
- `lib/crm/telegram-updates-server.ts`: `readTelegramUpdates`, `isOnlineResultNoticeOn` (fails
  open), `claimTelegramPeriod`, the daily job `runCrmTelegramUpdates`, and
  `sendTelegramUpdatesTest`.
- `app/api/results/hold/route.ts`: the notice now goes through `renderOnlineResultHeld` (today's
  text, moved verbatim) behind `isOnlineResultNoticeOn()`. Off: `telegramStatus: "skipped"`.
- `app/api/cron/results-sla/route.ts`: one more chained job, `crmTelegram`, after the Google
  review catch-up. `vercel.json` is unchanged.
- `app/api/settings/customers/telegram-updates/route.ts` (GET on `customers`; PUT on
  `customers-edit`, plus `results` for a change to the online Result switch) and
  `…/telegram-updates/test/route.ts` (POST on `customers-edit`). Both writes call
  `recordAdminAction` (`crm_telegram_updates.update`, `crm_telegram_updates.test`).
- Customers page: `customers-page-tabs.tsx` (header, plus *Customers* and *Settings* tabs in
  `?view=`), `views.ts`, and `telegram-updates-card.tsx` (a switch and example line per type, the
  weekly day, the read-only held-Result reminder line linking to Settings → General, and *Send
  test*). The page header moved out of `customers-client.tsx` into the tabs wrapper.

**Migrations.** None. Both keys live in `site_settings` and are created on first write, so nothing
changes on deploy. The compare-and-set is a PostgREST conditional update
(`update … where key = … and value = <text read>`), plus a plain insert whose unique-key collision
(23505) means another run created the row first. Checked against Postgres 16 (`mp_c14`): of two
overlapping updates, the second waits on the row lock and then matches no row; the second insert
fails `site_settings_pkey`; `anon` can read the row (public read, by design, and harmless) and
cannot change it.

**Seams for the slices that own the missing sources.** All in
`lib/crm/telegram-update-sources.ts`, so neither slice touches the job, the renderers or the card:

- **CRM 12:** replace the body of `countGoogleReviewsToMatch(admin)` (returns `null` today) with
  the count of its *Google reviews to match* list. The daily update then posts when it is > 0. Add
  a `WEEKLY_SUMMARY_SOURCES` entry returning `{ googleReviewsLinked }`.
- **Migration 12:** replace the body of `countSignUps(admin, window)` (returns `null` today) with
  two `head: true` counts on `customers.account_linked_at` in `[from, to)`, total and joined to
  `migrated_customers`. That one function feeds both *New sign-ups* (yesterday) and the weekly
  summary's sign-ups line, which is already registered.
- **CRM 07** adds `{ reviewRequests: { sent, opened } }` and **CRM 06** adds
  `{ followUps: { done, overdue } }` as `WEEKLY_SUMMARY_SOURCES` entries. `renderWeeklySummary`
  already has every line's wording, and a missing count renders no line.

While a seam returns `null` the job reports `not_built` for that type and posts nothing.

**Tests.**

- `lib/crm/__tests__/telegram-updates.test.ts`: settings defaults and per-type fallback, the patch,
  the online-switch change rule, SGT day and week windows across UTC midnight and the ISO year
  boundary, the compare-and-set step, every renderer to the PRD's exact example wording, the online
  notice's exact text (paired and single), and a scan of every CRM type's output and every test
  message for the fixture customers' names, emails and phones.
- `lib/crm/__tests__/telegram-updates-job.test.ts`: against an in-memory `site_settings` with a
  unique key: once per week however often the cron is re-run, once when three runs overlap, the
  next week posts again, not on another day, a failed send not retried that period, daily types
  once a day, nothing and no claim on a zero day, `not_built` from the real seams, off posts
  nothing, unreadable switches send nothing, no bot token claims nothing, the PII scan on
  everything the job posts, *Send test* only for enabled types, and two crons in `vercel.json`
  with the job chained in `results-sla`.
- `app/api/results/hold/__tests__/telegram-switch.test.ts`: off → 200, `telegramStatus:
  "skipped"`, no Telegram call, Checkout and email still happen; on, missing, unreadable and
  malformed → exactly today's text, Paired build lines included. The existing hold tests and the
  paired-build e2e suite pass unchanged.
- `app/api/settings/customers/__tests__/telegram-updates-route.test.ts`: real role checks.
  View-only is refused PUT and *Send test*; `customers-edit` changes CRM types and the day but
  gets a 403 for the online switch; with `results` (or Owner) it may. Also covers audit rows and
  400 for unknown keys. The slice 10 guard test picks up both new write routes.
- `app/[lang]/settings/customers/__tests__/telegram-updates-card-render.test.tsx`: every switch is
  live with both keys; the online switch is disabled, with its reason, with `customers-edit` alone;
  everything is read-only with no *Send test* without `customers-edit`.

**Deviations.**

- **"Open" is a line, not a word.** `sendTelegram` posts plain text, so each CRM type renders the
  example sentence exactly, then `Open: <Admin Panel link>` on the next line, which Telegram turns
  into a link. Singular forms are grammatical (*1 Google review is waiting to be matched to a
  customer.*, *1 customer signed up yesterday, from Shopify.*).
- **The online notice's text moved into `renderOnlineResultHeld`**, with no change to its content,
  so *Send test* posts exactly what a real hold posts. Its switch is read on its own, after the
  writes, and an unreadable setting means on. The SLA settings read is untouched.
- **The Customers page had no tabs.** This slice adds `?view=list|settings`, following the Users
  page's `?tab=`. CRM 06 (`followups`) and CRM 12 (`reviews`) add theirs to `views.ts`. The
  Settings tab has a two-column grid, ready for CRM 07's Aftercare card.
- **At most once is strict.** A type claims its period before it sends, so a send that Telegram
  refuses is not retried in that period. Without a bot token nothing is claimed.
- **Unreadable switches fail closed for scheduled types.** The online notice posts, as the slice
  says. A scheduled type can wait a day, and must not post while it is switched off.
- **The weekly summary goes only on its own day.** If the cron misses that day, the week is skipped.
  There is no catch-up later in the week.
- **Links.** *Google reviews to match* opens `/settings/customers?view=reviews` (CRM 12's tab; until
  then the page shows the list). The other two open `/settings/customers`.

**For the owner or ops.** Nothing is needed to deploy: every type is on, and nothing posts until
there is something to post. Two things to know:

- The first Monday after deploy posts a weekly summary with the new-customers line only.
- Open question: *new customers* counts every `customers` row created in the week. The week of a
  Shopify import it would count the imported rows. Migration 12 can exclude `created_by_import`
  rows through `migrated_customers` in the same source.

**Noticed, not fixed here.** `npx tsx components/settings/settings-mobile.check.ts` already fails at
the base commit, on a Costings assertion (`app/[lang]/settings/costings/page.tsx`). It is not wired
into `pnpm test`. Its Customers assertion still holds.
