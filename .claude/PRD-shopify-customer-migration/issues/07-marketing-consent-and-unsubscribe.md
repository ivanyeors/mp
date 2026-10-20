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

- [ ] The backfill subscribes exactly the Customers whose export said `yes`, and none who are
      `unsubscribed`.
- [ ] A GET of the unsubscribe page changes nothing. A POST with a valid token unsubscribes, and a
      POST with a bad token is a 400 with no change.
- [ ] A Gmail or Yahoo one-click unsubscribe (RFC 8058 POST) is honoured. Verified in slice 09.
- [ ] The Profile toggle round-trips and writes events.
- [ ] Order emails are unaffected: no unsubscribe link and no header in transactional mail.
- [ ] `./scripts/graphify update .` is run in the same commit.
