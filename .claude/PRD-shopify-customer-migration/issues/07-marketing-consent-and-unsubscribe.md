# 07 — Marketing consent with provenance, and one-click unsubscribe

**Issue:** [#271](https://github.com/ivanyeors/mp/issues/271) (parent #264)
**Type:** AFK
**Blocked by:** 02, 12
**User stories:** 4, 5
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:email`, `area:admin`

## Goal

The platform can say, for any Customer, whether we may market to them, why, and since when. It
can also honour "stop" in one click. This is the deploy gate for every campaign email
(README, first hazard), and it is useful beyond this initiative: the privacy policy already
promises opt-out (`app/[lang]/privacy-policy/page.tsx:67,148`).

## Schema

```sql
alter table customers
  add column marketing_email text not null default 'not_subscribed'
    check (marketing_email in ('subscribed','not_subscribed','unsubscribed')),
  add column marketing_email_updated_at timestamptz null,
  add column marketing_email_source text null
    check (marketing_email_source in ('shopify_import','account','unsubscribe_link','complaint','support'));

create table customer_consent_events (
  id          bigserial primary key,
  customer_id uuid not null references customers(id) on delete cascade,
  channel     text not null check (channel in ('email')),
  from_state  text not null,
  to_state    text not null,
  source      text not null,
  created_at  timestamptz not null default now()
);
```

- `customer_consent_events` is append-only and service-role only.
- The customer can read their own `marketing_email` through the existing own-row policy, and
  is meant to. Once CRM slice 02's column grants on `customers` exist, it also needs
  `grant select (marketing_email) on public.customers to authenticated`. Whichever of the two
  slices lands second adds that grant.

**Backfill from `migrated_customers`:** where `email_marketing_at_export = 'yes'` **and** the
Customer is currently `not_subscribed`, set `subscribed` with `source = 'shopify_import'` and
`updated_at = exported_at`, and write one event per row.

The rule is enforced in SQL: **nothing ever moves `unsubscribed` → `subscribed` except the
customer's own `account` action.** The importer applies the same rule to future batches.

## Unsubscribe

- **Token.** `HMAC-SHA256(customer_id, UNSUBSCRIBE_SECRET)`, base64url. It is stateless and
  never expires, because unsubscribe links must keep working forever. Compare it with
  `secretMatches` (`lib/auth/secret.ts`).
- **`GET /[lang]/unsubscribe?u=<customer_id>&t=<token>`.** A confirm page with one button. It
  makes no state change on GET, because link scanners prefetch GET requests.
- **`POST /api/email/unsubscribe`.** Accepts both the button and RFC 8058 one-click
  (`List-Unsubscribe=One-Click`). It sets `unsubscribed` with source `unsubscribe_link`,
  writes the event, and is idempotent.
- **Profile.** Add an *"Email me news and offers"* toggle on `/account` (source `account`). This
  is the platform's first first-party consent capture.

## Admin Panel

- `admin_customer_overview` (slice 12) adds `marketing_email` and `marketing_email_updated_at`.
- The Customers list gains an *Email consent* filter (*subscribed / not subscribed /
  unsubscribed*).
- The Customer detail shows the state, its source and date, and the event history from
  `customer_consent_events`. Staff can read consent, but not change it. Only the customer's own
  action, an unsubscribe link or a complaint changes it, so the history stays trustworthy. A
  support request to unsubscribe uses source `support`, through a single *Unsubscribe* button.

## Transport

- `OutgoingEmail` gains `headers?: Record<string, string>`.
- `ResendTransport` passes them through as Resend's `headers` field.
- `GmailTransport` appends them to the MIME headers (`lib/email/transport.ts:128`), encoding the
  values with `encodeHeaderValue`.
- `renderEmailShell` gains an `unsubscribeUrl` option, which renders a footer link in campaign
  mail only.

## Privacy policy

Add a dated paragraph, in copy the owner approves:

- customer accounts moved from Shopify to this platform on the given date;
- what was imported;
- that Shopify remains a processor until cutover (slice 10 removes it).

## Acceptance criteria

- [x] The backfill subscribes exactly the Customers whose export said `yes`, and none who are
      `unsubscribed`.
- [x] A GET of the unsubscribe page changes nothing. A POST with a valid token unsubscribes, and a
      POST with a bad token is a 400 with no change.
- [ ] A Gmail or Yahoo one-click unsubscribe (RFC 8058 POST) is honoured. Verified in slice 09.
      — _not yet: the route takes the RFC 8058 POST and is tested with one; a real Gmail and
      Yahoo inbox is slice 09 (HITL)_
- [x] The Profile toggle round-trips and writes events.
- [x] Order emails are unaffected: no unsubscribe link and no header in transactional mail.
- [ ] `./scripts/graphify update .` is run in the same commit. — _not yet: the integrator
      rebuilds the graph after merging_

## Build notes

**What was built.**

- **Consent, in SQL** (`20261020120000_marketing_consent.sql`). The three columns on `customers`,
  with a check that provenance exists exactly when a choice is recorded. `customer_consent_events`
  is append-only (a trigger refuses edits and deletes) and server-only (RLS on, no policy, no
  grant). `set_marketing_email()` is the one write path: it writes the state, its source and
  time, and one event together, does nothing when the state is unchanged, and allows each source
  only its own moves. Staff (`support`), the link and a complaint only unsubscribe. Only
  `account` and `shopify_import` subscribe, and `shopify_import` only from `not_subscribed`.
  Nothing moves anyone back to `not_subscribed`. A `before update` trigger on `customers`
  enforces the rule at the table: `unsubscribed` → `subscribed` only with source `account`,
  whatever path the update takes. `grant select (marketing_email) … to authenticated`, as
  "second to land". The source and date stay Staff-facing.
- **Backfill.** `apply_shopify_email_consent()` is one rule for the backfill and every import.
  It acts only on an explicit `yes` and a `not_subscribed` Customer, dates the change to the
  export day at midnight in Singapore, and writes one event each. The `updated_at` trigger is
  held off for the backfill, as slice 12 did.
- **Import path** (`20261020120100_customer_import_marketing_consent.sql`). It replaces
  `import_shopify_customers` (it applies consent after writing the `migrated_customers` row),
  `customer_import_undo_plan` (see below) and `undo_shopify_import`. The old migration is
  untouched.
- **Unsubscribe** (`lib/marketing-consent/unsubscribe.ts`). The token is
  `HMAC-SHA256(customer_id, UNSUBSCRIBE_SECRET)`, base64url, compared with `secretMatches`.
  `unsubscribeLinks()` builds the page URL (the footer link) and the one-click URL (the header).
  `listUnsubscribeHeaders()` gives `List-Unsubscribe` (with an optional `mailto`) and
  `List-Unsubscribe-Post`.
- **`GET /[lang]/unsubscribe`** (`app/[lang]/unsubscribe/page.tsx`) is a confirm page with one
  button. It is `noindex` and `no-referrer`, and it reads state only.
- **`POST /api/email/unsubscribe`** (`app/api/email/unsubscribe/route.ts`):
  - It takes the RFC 8058 one-click POST (answered `200`) and the page's button (`via=page`,
    answered `303` back to the page).
  - A bad link is `400 { error: "invalid_link" }`, and an unset secret is `503 not_configured`.
  - `GET` only redirects to the page.
- **The route's presence is checkable** (README, first hazard). `probeUnsubscribeRoute(origin)`
  sends an empty one-click POST and is ready only on `400 invalid_link`. Slice 08's sender
  should call it and refuse otherwise. The same probe runs from the command line:
  `npx tsx lib/marketing-consent/unsubscribe-route.check.ts <site>`.
- **Profile.** *"Email me news and offers"* (`app/[lang]/account/marketing-email-preference.tsx`,
  action `setMyMarketingEmail` in `app/[lang]/account/actions.ts`). The Customer comes from the
  session. Off is `unsubscribed`.
- **Admin Panel.**
  - `admin_customer_overview` adds `marketing_email` and `marketing_email_updated_at`, in its
    own file (`20261020200000_customer_overview_marketing_consent.sql`).
  - The Customers list gains an *Email consent* filter (`?consent=subscribed|not-subscribed|unsubscribed`,
    `lib/crm/customer-filters.ts`).
  - The Customer page gains a *Marketing email* card
    (`app/[lang]/settings/customers/[id]/marketing-consent-card.tsx`). It shows the state, its
    source, its date and the history, from `GET /api/shop/customers/[id]/marketing-consent`
    (`customers`). Its single *Unsubscribe* button POSTs to the same route (`customers-edit`,
    source `support`, audited).
- **Transport.**
  - `OutgoingEmail.headers`: Resend passes them as `headers`, and Gmail writes them into the MIME
    headers through `encodeHeaderValue`.
  - `extraHeaders()` refuses a line break in a value, a non-token name, and any header the
    transport owns (From, To, Subject, …).
  - `renderEmailShell({ unsubscribeUrl })` renders a footer *Unsubscribe* link.
  - `EmailCase.campaign` marks campaign entries in the registry.
- **Privacy policy.** The dated "moved from Shopify" paragraph is drafted in
  `app/[lang]/privacy-policy/page.tsx`. It stays hidden while `SHOPIFY_MOVE_DATE` is `null`.
- **Env.** `UNSUBSCRIBE_SECRET` is documented in `.env.example`.

**Migrations.**

- `20261020120000_marketing_consent.sql`
- `20261020120100_customer_import_marketing_consent.sql`
- `20261020200000_customer_overview_marketing_consent.sql`, which carries every earlier column.

All three are idempotent. `db-check.sh` applies every migration. The new
`supabase/tests/customer-migration/assert-07-marketing-consent.sql` asserts all of the
following, and slice 02/03/05/12's SQL asserts still pass against the full schema:

- the grants;
- the backfill, re-run over seeded rows, including one Customer who said yes and has since
  unsubscribed;
- the rule, by every path;
- idempotent unsubscribe;
- append-only events;
- the customer's own key reading the state but not writing it or reading its source;
- import, re-import and undo.

**Tests added.**

- `lib/marketing-consent/__tests__/unsubscribe.test.ts`: the token, the links, the headers, the
  probe, `describeConsent`.
- `app/api/email/unsubscribe/__tests__/route.test.ts`: GET changes nothing; a valid POST
  unsubscribes once; a bad token is a 400; a missing secret is a 503; the probe against the real
  handler.
- `app/[lang]/account/__tests__/marketing-email-action.test.ts`: the toggle round-trips and
  writes events.
- `app/api/shop/customers/__tests__/marketing-consent-route.test.ts`: read on `customers`,
  unsubscribe on `customers-edit`, and no way to subscribe.
- `lib/email/__tests__/transactional-no-unsubscribe.test.ts`:
  - no non-campaign registry entry carries an unsubscribe;
  - an order email has no headers;
  - a source scan keeps `List-Unsubscribe` and `unsubscribeUrl:` inside the unsubscribe
    facility (slice 08 adds its sender there on purpose);
  - the transport headers and their injection refusals.
- Extended: the filter tests, `cost-column-grants` (source and date hidden), the write-guard
  list, and the Customers render test.
- `lib/marketing-consent/__tests__/fake-consent.ts` mirrors `set_marketing_email` for the
  in-memory client.

**Deviations.**

- **Undo takes back the import's consent.** The slice is silent here. ADR 0028 (e) says undo
  "reverts nothing on `customers`" for a merged row. The existing
  `supabase/tests/customer-import/assert-restore.sql` holds that an untouched undo restores the
  prior state, and keeping the consent failed it. A wrong file must not leave anyone subscribed
  either. So for a merged Customer whose consent still comes from `shopify_import`, the undo
  sets them back to `not_subscribed` and deletes that import event
  (`revert_shopify_email_consent`). This is the one delete the append-only trigger allows,
  scoped by a transaction-local flag. A Customer who changed their consent since keeps it, and
  their history. A removed Customer's events go with the row (the cascade).
- **Undo's "referenced" check reads past the import's own events only.**
  `customer_consent_events` is left out of the catalog loop. Any consent event *not* from
  `shopify_import` keeps a created row as referenced. An unsubscribe must survive the undo,
  because a re-import would otherwise create that person afresh, and subscribed.
- **Additions to the schema as written:** checks on `from_state`, `to_state` and `source`; the
  provenance check on `customers`; and an index on `marketing_email`. The event stores when the
  change took effect, so a Shopify event carries the export day.
- **Staff's support unsubscribe** records no Staff profile on the event, because the slice's
  schema has none. Who pressed it is in `admin_audit_log` (`customer.marketing_unsubscribe`).

**Left for ops or the owner.**

- Set `UNSUBSCRIBE_SECRET` in production, and never rotate it once mail has gone out. Then run
  the check script against production before slice 08 sends anything.
- Approve the privacy-policy copy, set `SHOPIFY_MOVE_DATE` and `EFFECTIVE_DATE`. Slice 10 drops
  the processor sentence.
- Real-inbox one-click is slice 09.
