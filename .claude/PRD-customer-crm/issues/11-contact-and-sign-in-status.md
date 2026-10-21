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

- [x] Signing in with Google, then by email code, gives `account_providers = {email,google}`.
      A later load with no change writes nothing.
- [x] A Customer with no account shows *Not verified*, with its source. One with an account
      shows *Verified* with the date.
- [x] A number with a `whatsapp_inbound` row shows its latest date. A different number that only
      matches loosely does not, per `phonesMatch`'s tests.
- [x] A number whose latest reminder send failed shows the failure date, until a later send
      succeeds and clears `last_error`.
- [x] *Mobile: invalid* lists exactly the Customers whose `phone` fails `isValidPhone`, on
      fixtures.
- [ ] `./scripts/graphify update .` is run in the same commit. — _not yet: the integrator
      rebuilds the graph after merging_

## Build notes

**Built.**

- **The fact.** `customers.account_providers`, written by `touchAccountProviders`
  (`lib/auth/customer-identity.ts`), which `linkCustomerToAuthUser` calls after
  `touchCustomerLastSeen`. It reads the signed-in user's own `identities`, sorted and once each,
  and writes only when they changed. The update re-checks the login and the value it read
  (`.eq("account_providers", '{"google"}')`), so the second of two concurrent loads matches no
  row. It skips a user object with no `identities`, and a row another login owns. It never
  throws. There is no `auth.users` read and no `supabase.auth.admin` call.
- **Pure status.** `lib/crm/contact-status.ts` is client-safe: sign-in labels, `emailStatus`,
  `mobileStatus`, `formatPhone`, `describeMobile`, and the `ContactFacts` types.
- **Phone matching.** `lib/crm/contact-facts.ts` is server-only (`phonesMatch` sits beside the
  Google People client):
  - It reads `whatsapp_inbound` and `appointment_reminders` by the number's last eight digits,
    a superset of every `phonesMatch` match, and narrows them in TypeScript.
  - It gives the latest inbound date, whatever its `kind`. The latest failed reminder send
    counts only while nothing later says the number works: no later success on any row, and no
    later inbound message.
  - It lists the other numbers from bookings and Results. Results are matched by `customer_id`
    or by escaped lower-cased email, as the storefront matches them.
- **Customer detail.**
  - The **Contact and sign-in** card (`ContactCard` in `customer-account-cards.tsx`) replaces
    slice 12's Account card. It keeps the sign-up date as *Verified: signed in with it since*,
    and keeps the last signed-in visit.
  - It adds Email (Verified, or Not verified from checkout or from the Shopify import), Signs in
    with, Mobile, WhatsApp, and Other numbers seen.
  - `page.tsx` reads the phone-matched facts once the row's number is known. A failed read shows
    *Could not check WhatsApp*, and never fails the page.
- **Customers list.**
  - The Account column gains marks: an envelope for the email code, **G** for Google, and a
    phone when a valid number is on file (lucide icons, each with an `aria-label`).
  - New filters `google=linked|not-linked` and `mobile=on-file|missing|invalid`
    (`lib/crm/customer-filters.ts`).
  - The Account filter's options now read *Signed up · email verified* and
    *No account · email not verified*.

**Migrations.**

- `20261020123000_customer_contact_status.sql`:
  - The `account_providers text[] not null default '{}'` column.
  - A backfill from `auth.identities`, run once as the owner. It is the same kind of read as
    migration 12's `auth.users` backfill, and the `updated_at` trigger is held off for it.
  - A `before insert or update of auth_user_id` trigger that empties the list when the login
    goes or changes.
  - The check `customers_account_providers_with_login`.
  - `public.is_valid_phone(text)` and `public.is_blank_phone(text)`. These are `isValidPhone`
    and `!phone?.trim()` in SQL, with JavaScript's `trim()` whitespace spelled out. Their execute
    grant is revoked from anon and authenticated and given to `service_role`.
  - The column is not granted to the customer's key (`cost-column-grants.test.ts` lists it as
    hidden).
- `20261020200000_customer_overview_contact_status.sql`: the shared overview, redefined in its
  own file. It keeps every earlier column and adds `account_providers`, `has_phone` and
  `phone_valid`. `CUSTOMER_OVERVIEW_COLUMNS` matches.

**Tests.**

- `lib/auth/__tests__/customer-account-providers.test.ts`: Google, then email code, gives
  `{email,google}`, and a later load writes nothing. Also the conditional update's filters and
  failures that are swallowed.
- `lib/crm/__tests__/contact-status.test.ts`.
- `lib/crm/__tests__/contact-facts.test.ts`: the loose matches, the failed send cleared by a
  later success, the permission gating, and the escaped email.
- `lib/crm/__tests__/phone-agreement.test.ts`, which writes
  `supabase/tests/customer-crm/phone-cases.json`: 39 phones over every `normalizePhone` branch
  and its whitespace edges.
- `app/[lang]/settings/customers/__tests__/contact-card-render.test.tsx`.
- Updated: the filter test, slice 12's render test (the Account card is now this card), and the
  column-grant test.
- `supabase/tests/customer-crm/assert-11-contact-status.sql`, run against a database with every
  migration applied. It checks that `is_valid_phone` and `is_blank_phone` agree with
  `isValidPhone` on every fixture phone, and that the three Mobile filters partition the
  fixture Customers exactly as the TypeScript does. It covers the trigger (same login kept, new
  login emptied, login deleted emptied), the check, the conditional update, the backfill (by
  re-running the migration) and the grants. It is not part of CI.

**Deviations.**

- **No separate Email filter.** An account is bound by the email the person signed in with, so
  *email verified* is exactly *Signed up*. A second `email=` parameter would duplicate
  `account=`, and could contradict it. The Account filter's labels say *email verified* /
  *not verified* instead.
- **The Mobile filter partitions.**
  - *On file* is a number that passes `isValidPhone`, the same test as the list's mark.
  - *Invalid* is a number on file that fails it.
  - *Missing* is none.

  Read literally, *fails `isValidPhone`* would also cover a missing number, so *missing* would
  sit inside *invalid*.
- **The number on file is normalised before `phonesMatch`.** `phonesMatch` alone takes a bare
  eight digits as a suffix of any country's number: `8780 5311` would match `+44 8780 5311`. A
  local number on file is Singapore's, as `normalizePhone` (and the aftercare STOP lookup) has
  it. One digit off, or a fragment, still never matches.
- **The Mobile row is more specific than *Valid Singapore mobile*.** `isValidPhone` also
  accepts Singapore landlines (6…) and well-formed overseas E.164. The row says *Valid Singapore
  mobile*, *Valid Singapore landline* or *Valid overseas number*. All three count as *on file*.
- **Other numbers seen respect each source's permission.** Bookings are read only with
  `appointments`, and Results only with `results` (ADR 0027 (b)). With neither, the row is left
  out.
- **Failed sends come from `appointment_reminders` only.** `customer_whatsapp`, slice 13's
  aftercare ledger, keeps no failure time and has no sender until slice 07. Slice 07 can fold
  its failures into `latestFailedSendAt`.
- **The aftercare switches stay in their own card,** directly under this one, not inside it.
  This card only reads facts. The switches change things under `customers-edit`, with a
  dialog, a required note and their own history. A card inside a card would not read better,
  and keeping them apart leaves slice 13's card, route and tests as they are. Its comment says
  so.
- **The Marketing and *Email bounced* lines are not built.** Migration slices 07 and 08 have
  not landed. Each of those slices adds its line here.
- **No new route.** The phone-matched facts are read for the number on file when the page
  loads. If Staff edit the phone, the card asks for a reload, rather than showing WhatsApp
  facts for the old number.

**For the owner and ops.** Nothing to run. The backfill fills `account_providers` for existing
accounts on deploy. Any account it misses is filled on that person's next account page load.

**Open: the glossary.** `CONTEXT.md`'s **Contact status** entry still says *Replied on WhatsApp
(the number answered an Appointment reminder)*. ADR 0027 (j) and this slice derive it from any
`whatsapp_inbound` message. The entry was not edited here, because this slice's criteria do not
call for it. A one-line fix is worth making.
