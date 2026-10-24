# 08 — Campaign emails, the send ledger, and a wave sender that cannot double-send

**Issue:** [#272](https://github.com/ivanyeors/mp/issues/272) (parent #264)
**Type:** AFK
**Status:** built in `2c9312b` on `claude/shopify-migration-plan-izv7fo`
**Blocked by:** 06, 07
**User stories:** 1, 4, 5, 11
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:email`

## Goal

Send three kinds of campaign email in waves a human controls. No one gets the same email twice,
no one who said stop gets anything, and nothing goes out through the mailbox that sends order
emails.

## Templates

These go in `lib/email/migration.ts`, registered in `lib/email/registry.ts`, previewable with
`npm run email:*`, and rendered with `renderEmailShell({ audience: "customer", unsubscribeUrl })`.

- `EmailGroup` is a closed union (`lib/email/registry.ts:70-78`), so add a `migration` group.
- Each template needs a fixture in `lib/email/__fixtures__/samples.ts`.
  `__tests__/registry-coverage.test.ts` fails the build on a renderer with no registry entry.

| Template | Who | Content |
|---|---|---|
| `migration_announcement` | Migrated customers, unclaimed, `subscribed` | *"Your Mpillow account is ready."* Explains the move in one paragraph, has a single button (the Claim link), states the voucher and its terms, and says what the account does (addresses saved, re-adjustment booking, orders, returns). |
| `migration_reminder` | Announcement sent ≥ 7 days ago, still unclaimed, still `subscribed`; **once** | Short. The voucher's issue-until date, and the same button. |
| `migration_service_notice` | Migrated customers, unclaimed, `not_subscribed` (never `unsubscribed`); **once** | *"Mpillow has moved."* Says where to sign in, re-adjustments and support. It has **no offer, no voucher and no promotion**; counsel confirms the copy (PRD, legal points). |

The `welcome_voucher` email belongs to slice 05, because it is transactional.

## Ledger

```sql
create table customer_campaign_sends (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references customers(id) on delete cascade,
  template      text not null check (template in ('migration_announcement','migration_reminder','migration_service_notice')),
  wave          text not null,
  status        text not null check (status in ('sent','failed','bounced','complained')),
  provider_message_id text null,
  sent_at       timestamptz not null default now(),
  unique (customer_id, template)
);
```

## Sender

The sender is a script, so a human runs every wave:

```
npx tsx --env-file=.env.local scripts/customer-migration-send.ts \
  --template migration_announcement --wave w1 --limit 200 [--buyers-only] [--apply]
```

**Before it sends anything:**

- It is **dry-run by default** and prints the eligible count and the selection it would send.
- **It refuses to run** if:
  - the transport is not Resend;
  - `CAMPAIGN_EMAIL_FROM` is not on the campaign subdomain;
  - `POST /api/email/unsubscribe` does not answer on the target site (the README's first hazard).

**What it selects:**

- It re-checks eligibility per recipient **at send time**: unclaimed, consent state, not bounced,
  not complained, no existing ledger row.
- Candidates are ordered buyers first (`shopify_orders_count ≥ 1`), then by most recent import.
  `--buyers-only` excludes subscribers who never bought.

**How it sends:**

- It inserts the ledger row **before** sending. The unique constraint makes a second run, or a
  concurrent run, skip that person.
- On a send error it marks the row `failed`. A failed row is retried only with
  `--retry-failed`.
- It throttles to about 2 messages a second, and stops after 5 consecutive failures.
- Its transport is `getCampaignTransport()`, built from `CAMPAIGN_RESEND_API_KEY` and
  `CAMPAIGN_EMAIL_FROM`. It is a separate instance from `getDefaultTransport()`.
  - **The key must not be called `RESEND_API_KEY`.** `resolveTransport` picks Resend for
    *order* mail whenever `RESEND_API_KEY` is set and `EMAIL_PROVIDER` is not
    (`lib/email/transport.ts:173-200`). A campaign key under that name would silently move every
    order email off Gmail.
  - Belt and braces: production sets `EMAIL_PROVIDER=gmail` explicitly, and a check test
    asserts `getDefaultTransport()` ignores `CAMPAIGN_RESEND_API_KEY`.
- Every send sets `List-Unsubscribe: <https://…/api/email/unsubscribe?u=…&t=…>`, `<mailto:…>` and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Reply-To is the support address.

**Audience selection lives in `lib/`, not in the script.** `selectCampaignAudience(template,
filters)` (`lib/customer-migration/audience.ts`) is a pure function plus one query, and the
script only parses flags and calls it. The Campaigns page that the future email-marketing
initiative builds (`PRD-email-marketing`) calls the same function and writes to the same
ledger. Moving sending into the Admin Panel later therefore means adding a page, not
rewriting the rules. The sends appear on the CRM timeline through one adapter
(`PRD-customer-crm`, slice 03).

**Admin Panel.** `admin_customer_overview` adds `last_campaign_sent_at`, and the migration card
(slice 12) gains *Emailed*.

## Bounces and complaints

`POST /api/email/resend-webhook` verifies Resend's signature, then handles two events:

- `email.bounced` (hard bounce) → mark the send `bounced`, and exclude the address from every
  later wave.
- `email.complained` → mark the send `complained`, and set the Customer `unsubscribed` with
  source `complaint` (an event is written).

## Acceptance criteria

- [x] Running the same `--apply` twice sends nothing the second time.
- [x] Two concurrent runs never send one person the same template twice. The ledger unique
      constraint proves this, not timing.
- [x] An `unsubscribed` Customer is never selected for any template. A `not_subscribed` Customer
      is never selected for the announcement or the reminder.
- [x] The sender refuses Gmail, a non-campaign From address, and a site without the unsubscribe
      route.
- [x] A bounce or complaint webhook updates the ledger, and a complaint unsubscribes. A forged
      signature gets a 401.
- [x] Previews of all three templates render in the existing email preview tooling.
- [x] `./scripts/graphify update .` is run in the same commit.

## Build notes

Built on `claude/shopify-migration-plan-izv7fo` @ `fa224ce`.

**What was built**

- **The ledger and the rule, in SQL** (`20261020130000_customer_campaign_sends.sql`).
  - `customer_campaign_sends` as specified, unique on (Customer, template), server-only.
  - `campaign_send_blocker()` is the rule: why this Customer may not get this template now,
    or null. `claim_campaign_send()` runs it and writes the row in the same call, so each
    recipient is re-checked at the moment of sending: Claimed, consent, bounced, complained,
    already sent, and for the reminder an announcement sent at least 7 days ago.
  - `finish_campaign_send()` marks the row `sent` (with Resend's id) or `failed`.
  - `record_campaign_send_event()` takes the webhook's bounce or complaint. A complaint also
    calls `set_marketing_email(…, 'unsubscribed', 'complaint')` in the same transaction.
  - Two server-only views for the sender: `customer_campaign_candidates` (every Migrated
    customer with their sends) and `customer_campaign_wave_stats` (each wave's numbers).
- **The rule, in TypeScript.** `lib/customer-migration/campaign.ts` has the templates, their
  registry ids, and `campaignBlocker`, the same rule for the dry run.
  `supabase/tests/customer-migration/campaign-cases.json` is one table of 32 cases that both
  `campaignBlocker` (vitest) and `campaign_send_blocker` (the SQL assert) must answer the same.
- **The audience.** `selectCampaignAudience(admin, template, filters)`
  (`lib/customer-migration/audience.ts`) is one query, paged 1,000 rows at a time, then
  `planCampaignAudience`, which is pure. Buyers come first, then the most recent import, then
  the id, so two runs order the list the same way. `--buyers-only` leaves out non-buyers.
- **The sender.** `lib/customer-migration/wave-sender.ts` holds every decision. It runs
  `campaignPreflight` before every wave, in a dry run too, and `runCampaignWave` sends.
  `scripts/customer-migration-send.ts` only parses flags and prints `formatWaveReport`
  (emails masked). Each send:
  - claims the row, then mints its own Claim link (`mintClaimLink`, the hash only);
  - sends with Reply-To set to the support inbox, the footer unsubscribe link, and
    `List-Unsubscribe` (the one-click URL and a `mailto:` to the support inbox) with
    `List-Unsubscribe-Post`;
  - sleeps 500 ms after each send, and stops after 5 failures in a row.
- **The transport.** `getCampaignTransport()` (`lib/email/campaign-transport.ts`) is a
  `ResendTransport` built from `CAMPAIGN_RESEND_API_KEY`, or null without the key.
  `checkCampaignFrom` requires `CAMPAIGN_EMAIL_FROM` to be on exactly `CAMPAIGN_EMAIL_DOMAIN`.
  That must be a subdomain, not Resend's test domain, and not the order mailbox's domain.
- **What it refuses, before claiming anyone.** Each is a check the dry run prints:
  - a transport that is not Resend, or no key;
  - a From off the campaign subdomain;
  - no support inbox for Reply-To;
  - a site that is not public https;
  - `POST /api/email/unsubscribe` not answering `probeUnsubscribeRoute` (README, first hazard);
  - a site whose `UNSUBSCRIBE_SECRET` differs from this machine's (`probeUnsubscribeSecret`, new
    in `lib/marketing-consent/unsubscribe.ts`). It one-click POSTs a link signed here for a
    Customer id no row has: `200` means the secrets match, and nobody is unsubscribed;
  - an offer template while `welcomeVoucherIssuing` says a sign-in would issue no voucher (the
    email promises one);
  - the service notice while owner decision 3 is unanswered;
  - the latest wave holding the PRD's pause condition (bounces over 2%, complaints over 0.1%),
    unless `--resume`.
- **The templates.** `lib/email/migration.ts` holds `renderMigrationAnnouncementEmail`,
  `renderMigrationReminderEmail` and `renderMigrationServiceNoticeEmail`. They are registered
  with `campaign: true` in a new `migration` email group, with fixtures in
  `__fixtures__/samples.ts` (plus a free-shipping variant of the announcement). They show in
  `/dev/email-preview` and the contact sheet, whose group lists gain `migration`, and in
  `npm run email:dump`. Each has one button. The service notice has no offer, voucher, price or
  promotion.
- **The webhook.** `POST /api/email/resend-webhook` (`app/api/email/resend-webhook/route.ts`;
  verification in `lib/email/resend-webhook.ts`):
  - It checks Resend's Svix signature against `CAMPAIGN_RESEND_WEBHOOK_SECRET`, within five
    minutes. A forged, missing or stale signature gets a 401, and an unset secret a 503.
  - `email.bounced` marks the send `bounced`, unless Resend calls the bounce `Transient`.
    `email.complained` marks it `complained` and unsubscribes.
  - Other events, and message ids that are not campaign sends, get a 200 and are ignored. A
    database failure gets a 500, so Resend retries.
- **The Admin Panel.** `admin_customer_overview` gains `last_campaign_sent_at`.
  `admin_customer_migration_summary` gains `emailed`, `emails_bounced` and `emails_complained`.
  The Migration card gains *Emailed* ("960 (80%)", "12 bounced, 1 marked as spam"), before
  *Clicked*.
- **The timeline.** `lib/crm/timeline/sources/campaign-sends.ts`, gated by `customers`, under
  the Marketing chip, has three dated streams:
  - `campaign_email.sent` at `sent_at`, with its status as the pill. A failed or in-flight send
    reached nobody and is not shown.
  - `campaign_email.bounced` at `bounced_at`.
  - `campaign_email.complained` at `complained_at`.
- **Env.** `.env.example` documents `CAMPAIGN_RESEND_API_KEY`, `CAMPAIGN_EMAIL_FROM`,
  `CAMPAIGN_EMAIL_DOMAIN`, `CAMPAIGN_RESEND_WEBHOOK_SECRET` and `SUPPORT_EMAIL`.

**The ledger choice: its own, not `customer_emails`.** Campaign sends use
`customer_campaign_sends`, as this slice and `PRD-email-marketing` ("Ledger first") specify.
`customer_emails` (slice 05) is the transactional ledger. It retries a failure by itself, up
to three times. It has no wave, no bounce and no complaint. Its sends go through the
transactional transport. A campaign failure is retried only when a human asks, a bounce
suppresses the Customer, and the transport must never be the order mailbox. The email-marketing
initiative widens this table's `template` check rather than adding another ledger.

**Migrations**

- `20261020130000_customer_campaign_sends.sql`: the table, its five functions, its two views,
  and the `migration_service_notice_enabled = 'false'` seed.
- `20261020200700_customer_overview_campaign_sends.sql` (reserved in the shared-views range):
  - both views redefined in full;
  - the overview keeps all 39 columns of the latest definition, CRM 12's
    `20261020200500` (see the catch-up note below), then `last_campaign_sent_at`;
  - the summary keeps all 11 columns from `20261020200100`, then its three new ones.
- Both apply in order with `db-check.sh` (183 migrations after the catch-up), and both
  re-apply idempotently.

**Tests**

- `supabase/tests/customer-migration/assert-08-campaign-sends.sql`. Run it from the repo
  root; it prints `slice 08 campaign sends ok`. It asserts:
  - **Grants.** Nothing for `anon` or `authenticated` on the table, the views or the functions.
  - **The rule.** All 32 cases of `campaign-cases.json`.
  - **Claims.** Claim, finish, and the same claim again (`already_sent`, in any wave). The
    reminder is refused before 7 days and allowed after, once. Unsubscribed and not-subscribed
    Customers are refused and nothing is written. Owner decision 3 is off by default.
  - **Failures.** A failure is kept. It is retried only with retry, only in its own wave, and a
    retry never adds anyone new.
  - **The race.** Two `dblink` sessions claim one Customer and template at once. The second is
    asserted blocked behind the first's uncommitted row, and one row results. Then the same for
    two concurrent retries of one failure: one retry, `attempts = 2`.
  - **The webhook's function.**
    - A bounce is recorded once and suppresses later templates.
    - A complaint marks the send, unsubscribes with source `complaint`, and writes exactly one
      consent event, also after a bounce. Repeats change nothing.
    - An unknown id is ignored, and an unknown event raises.
  - **The views.** The overview's `last_campaign_sent_at`, the candidates' `sends` JSON, the
    wave stats, and the summary's three counts, measured with and without the fixtures.

  Slice 05, 06, 07 and 12's asserts, CRM 06's and CRM 11's still pass on the same database.
- vitest:
  - `lib/customer-migration/__tests__/campaign.test.ts`:
    - the cases table;
    - exhaustive checks that `unsubscribed` is never eligible, `not_subscribed` never for the
      announcement or reminder, `subscribed` never for the notice, suppression, and no resend;
    - that the SQL names the same templates, statuses, reasons, 7 days and setting key;
    - that each template is a registered campaign email.
  - `audience.test.ts`: the order, `--buyers-only`, the wave's room, retry selection, row
    parsing, and paging.
  - `wave-sender.test.ts`, against `fake-campaign-db.ts`, an in-memory ledger with the unique
    key:
    - a dry run sends and writes nothing;
    - every refusal above claims nobody;
    - the headers, Reply-To, footer link and Claim link (one per email, hash only);
    - the same `apply` twice sends nothing, and another wave never resends anyone;
    - two runs at once send three emails in total;
    - someone who unsubscribes after selection is skipped;
    - failure, then retry;
    - five failures in a row stop the wave;
    - the reminder's 7 days;
    - the service notice with no offer.
  - `lib/email/__tests__/migration-emails.test.ts`: the registry entries, one button each, the
    footer link, the voucher terms, and no offer in the notice.
  - `lib/email/__tests__/campaign-transport.test.ts`: `getDefaultTransport()` ignores
    `CAMPAIGN_RESEND_API_KEY` (console alone, Gmail beside it, and `EMAIL_PROVIDER=gmail` with
    a stray `RESEND_API_KEY`), the campaign key is what Resend is called with, and the From
    rules.
  - `app/api/email/resend-webhook/__tests__/route.test.ts`:
    - a forged, tampered, missing or stale signature gets a 401 and changes nothing;
    - a hard bounce is recorded once, and a transient bounce is ignored;
    - a complaint unsubscribes with one event;
    - anything else is acknowledged.
  - `probeUnsubscribeSecret` is tested against the real unsubscribe route
    (`app/api/email/unsubscribe/__tests__/route.test.ts`).
  - Extended:
    - `timeline-route.test.ts`: sends, a bounce, a failed send that is not shown, and Kim's
      complaint on Kim's timeline only;
    - the Migration card and summary tests;
    - the overview fixtures;
    - the `transactional-no-unsubscribe` allowlist: `lib/email/migration.ts`, its fixtures and
      `lib/customer-migration/wave-sender.ts`, on purpose.

**Deviations**

- **`pending` is a fifth status.** The slice's check lists `sent`, `failed`, `bounced` and
  `complained`, and says the row is inserted *before* sending. A row needs a state between the
  claim and the provider's answer, and `pending` is it. A crash leaves the row `pending`, and a
  pending row is never sent again, because it may have gone.
- **Additional columns:** `attempts`, `last_error`, `bounced_at` and `complained_at`, with checks
  that a bounced or complained row is dated. ADR 0029 (k) says to store facts and timestamps,
  and the timeline needs a stored time for each fact. There is also a unique index on
  `provider_message_id`, which the webhook finds sends by.
- **A wave holds at most `--limit` people.** "Running the same `--apply` twice sends nothing"
  can only hold if the wave label scopes the run. Otherwise the second run would select the next
  200. So a wave's size counts its rows of that template, and the next 200 need `--wave w2`.
  - `--retry-failed` selects only that wave's failures and re-claims them in the same wave, so
    it never adds anyone.
  - Two concurrent runs of one command walk the same ordered selection and share it.
- **Extra refusals the slice does not list:**
  - the secret-match probe;
  - the voucher check (the announcement and reminder promise a voucher);
  - Reply-To and a public https site;
  - the PRD's pause rule as a check, with `--resume` to override it after investigating.

  Each is a check the dry run prints, so none blocks silently.
- **Owner decision 3 is a setting, not a flag.** `migration_service_notice_enabled` in
  `site_settings` is seeded `'false'`. The sender refuses the service notice while it is
  anything else, and so does `claim_campaign_send` itself. There is no Admin Panel switch for
  it.
- **The service notice carries a Claim link** as its sign-in button: it prefills the email and
  counts the click, and offers nothing. A signed-in visitor to the welcome page who holds a
  voucher sees it there, which the PRD allows ("the voucher is shown on the site, not in their
  inbox"). The welcome page's *wrong account* screen says "Your voucher was sent to the email
  you shopped with", which is not true for a service-notice recipient. That is slice 06's copy;
  revisit it if decision 3 turns the notice on.
- **The target site is `NEXT_PUBLIC_SITE_URL`**, with no `--site` flag. Every link, the logo
  and the probes use the same origin.
- **No sender in the Admin Panel.** The slice makes the sender a script a human runs, so there
  is no cron and no new write path for Staff. The script holds no rules, so a Campaigns page
  later is a page.

**Left for ops and the owner**

- **Owner decision 4.** Choose the subdomain and Resend account, then set
  `CAMPAIGN_RESEND_API_KEY`, `CAMPAIGN_EMAIL_FROM`, `CAMPAIGN_EMAIL_DOMAIN` and `SUPPORT_EMAIL`
  where the sender runs. Never name the key `RESEND_API_KEY`, and keep `EMAIL_PROVIDER=gmail`
  in production.
- **The webhook.** Add `https://<site>/api/email/resend-webhook` in Resend with `email.bounced`
  and `email.complained`, and set `CAMPAIGN_RESEND_WEBHOOK_SECRET` in Vercel. Until then,
  bounces and complaints are not recorded.
- **The secret.** The machine that runs the sender needs production's `UNSUBSCRIBE_SECRET`
  (slice 07); the sender checks it matches.
- **Owner decision 3.** To send the service notice, set
  `site_settings.migration_service_notice_enabled = 'true'`, and only after counsel confirms
  its copy.
- **Owner decision 2.** Set the voucher terms (Discounts → *Welcome-back voucher*) before the
  announcement: the sender refuses until a sign-in would issue one.
- **A send can be marked failed and still have been delivered.** A network timeout can do this.
  Check Resend's log before running `--retry-failed`.
- **A row left `pending`** by a crash between the claim and Resend's answer is never resent.
  Resend's log says whether it went. Setting it `sent` or `failed` is a manual fix.
- Slice 09 runs the pilot and the waves.

**After merging CRM 05, CRM 12 and CRM 08**

- **CRM 05 (Segments)** merged cleanly. Its `20261020131000` adds no view.
- **CRM 08 (check-ups)** adds no view. Two conflicts, resolved by keeping both:
  - `lib/crm/timeline/registry.ts`: `checkupsAdapter` and `campaignSendsAdapter` are both
    imported and registered, and the "still to come" list is now empty;
  - `lib/email/__fixtures__/samples.ts`: `sampleCheckup`, then the campaign fixtures.
- `db-check.sh` applies 183 migrations after all three merges.
- **CRM 12 (reviews)** redefined `admin_customer_overview` at `20261020200500`, which sorts before
  this slice's `20261020200700`. This slice's redefinition now carries CRM 12's seven review
  columns and their joins, then `last_campaign_sent_at`. `CUSTOMER_OVERVIEW_COLUMNS` lists them
  in the same order.
- **Conflicts resolved, keeping both sides:**
  - `lib/crm/customer-overview.ts`: the column list and the row type;
  - `lib/crm/timeline/registry.ts`: CRM 12's `googleReviewsAdapter` and this slice's
    `campaignSendsAdapter` are both registered;
  - `timeline-route.test.ts`: both fixtures, and the customers-only role's kinds include
    `google_review` and `campaign_email`;
  - the overview row fixtures in `account-status-render`, `contact-card-render` and
    `crm-filters-render`. CRM 12's new `reviews-render` fixture gains `last_campaign_sent_at`
    too.
