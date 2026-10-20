# 11 — Contact and sign-in status: is the email verified, how do they sign in, is the mobile reachable

**Issue:** [#288](https://github.com/ivanyeors/mp/issues/288) (parent #277)
**Type:** AFK
**Blocked by:** 01; migration PRD slice 12 (Account status and `linkCustomerToAuthUser` changes)
**User stories:** 19, 20
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:admin`

## Goal

For any **Customer**, Staff can see at a glance whether their email and their mobile are
"linked up":

- whether the email is verified, and how they sign in;
- whether we have a mobile number, and whether it is real;
- whether that number has ever answered us on WhatsApp;
- which reminders they will receive.

Before choosing how to reach someone, Staff know which channel actually reaches them.

## What can be known today

- **Email.** A Customer with an account is bound by **verified** email: `linkCustomerToAuthUser`
  adopts a row only when the signed-in email matches (`lib/auth/customer-identity.ts`). So
  *has an account* means *email verified*. A Customer without one has an email typed at
  checkout or imported, never verified.
- **Sign-in methods.** Sign-in is passwordless: an emailed code, or Google
  (`components/auth/login-form.tsx`). Whether Google is linked is known only from the signed-in
  user's `identities` (`app/[lang]/account/page.tsx:38`), and nothing stores it.
- **Mobile.**
  - **No mobile sign-in.** The platform never verifies a phone number by sign-in.
  - **Where numbers come from.** `customers.phone`, typed at checkout
    (`app/api/shop/checkout/route.ts:652`). The Profile only shows it
    (`app/[lang]/account/page.tsx:37,59-61`) until slice 13 lets a customer set it there. Bookings
    and Results carry their own phone snapshots (`readjustment_bookings.phone`,
    `mp_config_responses.customer_phone`).
  - **Normalising and matching.** `normalizePhone`, `isValidPhone` (`lib/appointments/phone.ts:18,44`)
    and `phonesMatch` (`lib/appointments/contacts.ts:55`).
- **WhatsApp.** Since 2026-10-20 every message a person sends to the utility sender is recorded
  in `whatsapp_inbound` (phone, kind, outcome, `received_at`; never the text;
  `20261020024120`), keyed by phone, with no Customer link. A row proves the number reaches a
  person on WhatsApp. Reminder statuses no longer prove it: since #258 and #259 a confirmed or
  rescheduled reminder moves on to `reminded` or `morning_sent`, and `cancelled` also comes from
  Staff and the calendar (`lib/appointments/state.ts:48-80`, `lib/appointments/cancel.ts:66-68`).
- **Failed sends.** A send that failed leaves `appointment_reminders.last_error` and
  `last_error_at` (`20261019152211`).

## Schema

```sql
alter table customers
  add column account_providers text[] not null default '{}';   -- e.g. {email,google}
```

- `linkCustomerToAuthUser` writes it from `user.identities`, sorted and de-duplicated. It only
  writes when the value changed, through the same conditional update as migration slice 12's
  `account_last_seen_at`.
- No `supabase.auth.admin.*` call, and no `auth.users` join.
- A Customer who links Google from their Profile (`AccountSecurity` on `/account`) shows
  *Google* after their next account page load.
- **No "verified" flags are stored and none is typed by Staff** (ADR 0027 j). Each status
  below is derived from a fact.

## What Staff see

### The Contact and sign-in card (Customer detail)

This replaces slice 12's Account card and keeps everything in it.

| Row | Shows | From |
|---|---|---|
| **Email** | the address, then *Verified: signed in with it since {date}*, or *Not verified: from checkout* / *from the Shopify import* | `account_linked_at`, `migrated_customers` |
| **Signs in with** | *Email code*, *Google*, or both; *No account yet* | `account_providers` |
| **Last signed-in visit** | date | `account_last_seen_at` |
| **Mobile** | the number, formatted; *Valid Singapore mobile* or *Not a valid number*; *No mobile on file* | `customers.phone`, `isValidPhone` |
| **WhatsApp** | *Messaged us on WhatsApp on {date}*, or *No WhatsApp message yet*; *Our last WhatsApp to this number failed on {date}* when that is the latest fact | `whatsapp_inbound` where `phonesMatch`, latest `received_at`; `appointment_reminders.last_error_at` |
| **Other numbers seen** | numbers from their bookings and Results that differ from the one on file, with dates, so Staff can ask which is current | bookings and Results |
| **Aftercare** | By email on/off and by WhatsApp on/off, each with its last change (who, how, when) and slice 13's manual switches; Marketing *subscribed / not subscribed / unsubscribed* (once migration slice 07 lands); *Email bounced on {date}* (once migration slice 08 records bounces) | `aftercare_email`, `aftercare_whatsapp`, `customer_preference_events`, `marketing_email`, `customer_campaign_sends` |

Notes on the card:

- **Any inbound row counts,** whatever its `kind`, `unknown` included: a person typed something
  from that number. History starts on 2026-10-20, when the table was created; an older reply is
  not known.
- **The WhatsApp row is resolved in TypeScript** with `phonesMatch`, on the detail page only.
  Phone matching does not belong in a list query.

### Customers list

- **The Account column** (migration slice 12) shows the sign-in methods as small marks: ✉ code,
  **G** Google. A 📱 mark appears when a valid mobile is on file.
- **New filters** (slice 04's schema):
  - Email: *verified / not verified*;
  - Google: *linked / not linked*;
  - Mobile: *on file / missing / invalid*.

## Acceptance criteria

- [ ] Signing in with Google, then by email code, gives `account_providers = {email,google}`.
      A later load with no change writes nothing.
- [ ] A Customer with no account shows *Not verified*, with its source. One with an account
      shows *Verified* with the date.
- [ ] A number with a `whatsapp_inbound` row shows its latest date. A different number that only
      matches loosely does not, per `phonesMatch`'s tests.
- [ ] A number whose latest reminder send failed shows the failure date, until a later send
      succeeds and clears `last_error`.
- [ ] *Mobile: invalid* lists exactly the Customers whose `phone` fails `isValidPhone`, on
      fixtures.
- [ ] `./scripts/graphify update .` is run in the same commit.
