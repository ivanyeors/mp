# 11 — Contact and sign-in status: is the email verified, how do they sign in, is the mobile reachable

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
  - **Where numbers come from.** `customers.phone`, typed at checkout or on the Profile.
    Bookings and Results carry their own phone snapshots
    (`readjustment_bookings.phone`, `mp_config_responses.customer_phone`).
  - **Normalising and matching.** `normalizePhone`, `isValidPhone` (`lib/appointments/phone.ts:18,44`)
    and `phonesMatch` (`lib/appointments/contacts.ts:55`).
- **WhatsApp.** **Appointment reminders** go by WhatsApp and record the guest's reply as a
  status (`appointment_reminders`, `20260709120000:11-20`), keyed by phone, with no Customer
  link. A reply proves the number reaches a person on WhatsApp.

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
| **WhatsApp** | *Replied to a reminder on {date}*, or *No WhatsApp reply yet* | `appointment_reminders` where `phonesMatch`, with a status only a guest reply produces |
| **Other numbers seen** | numbers from their bookings and Results that differ from the one on file, with dates, so Staff can ask which is current | bookings and Results |
| **Aftercare** | By email on/off and by WhatsApp on/off, each with its last change (who, how, when) and slice 13's manual switches; Marketing *subscribed / not subscribed / unsubscribed* (once migration slice 07 lands); *Email bounced on {date}* (once migration slice 08 records bounces) | `aftercare_email`, `aftercare_whatsapp`, `customer_preference_events`, `marketing_email`, `customer_campaign_sends` |

Notes on the card:

- **"A status only a guest reply produces"** is defined once, from `lib/appointments/state.ts`'s
  inbound actions: `confirm`, `request_reschedule`, `slot_picked` and `slots_rejected`. Export
  that set from `state.ts` rather than copying a list into the CRM.
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
- [ ] A number that replied to an appointment reminder shows the reply date. A different number
      that only matches loosely does not, per `phonesMatch`'s tests.
- [ ] *Mobile: invalid* lists exactly the Customers whose `phone` fails `isValidPhone`, on
      fixtures.
- [ ] `./scripts/graphify update .` is run in the same commit.
