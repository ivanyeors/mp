# 08 — Campaign emails, the send ledger, and a wave sender that cannot double-send

**Issue:** [#272](https://github.com/ivanyeors/mp/issues/272) (parent #264)
**Type:** AFK
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

- [ ] Running the same `--apply` twice sends nothing the second time.
- [ ] Two concurrent runs never send one person the same template twice. The ledger unique
      constraint proves this, not timing.
- [ ] An `unsubscribed` Customer is never selected for any template. A `not_subscribed` Customer
      is never selected for the announcement or the reminder.
- [ ] The sender refuses Gmail, a non-campaign From address, and a site without the unsubscribe
      route.
- [ ] A bounce or complaint webhook updates the ledger, and a complaint unsubscribes. A forged
      signature gets a 401.
- [ ] Previews of all three templates render in the existing email preview tooling.
- [ ] `./scripts/graphify update .` is run in the same commit.
