# 13 — Aftercare by email and WhatsApp, with a manual switch to turn them off

**Type:** AFK, plus HITL for Meta template approval
**Blocked by:** 01, 10
**User stories:** 25, 26, 27, 28
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:customers`, `area:email`, `area:whatsapp`

## Decided

The owner decided on 2026-10-20:

- **Both channels.** The review request (slice 07) and the check-up reminder (slice 08) go by
  **email and WhatsApp**.
- **A manual switch.** When a customer wants the reminders to stop, Staff can switch them off
  for that customer.

## Goal

One place decides whether a **Customer** gets **Aftercare messages** by email and by
WhatsApp. Five ways change it:

- the customer, in their Profile;
- the customer, by replying STOP on WhatsApp;
- the customer, from a link in the email;
- the customer, at checkout;
- Staff, with a manual switch on the Customer page.

Every change records who made it, how, and when.

## Two channels, two defaults

- **Email: on by default.** A service message with an opt-out (ADR 0027 f).
- **WhatsApp: off until the customer opts in.** Meta requires a person's opt-in before a
  business starts a conversation. The precedent is the partners' `notify_whatsapp`, which
  defaults to false while email stays always-on (`20260802000000_partner_notify_whatsapp.sql:1-12`).

## Schema

```sql
alter table customers
  add column aftercare_email    boolean not null default true,
  add column aftercare_whatsapp boolean not null default false;
grant select (aftercare_email, aftercare_whatsapp) on public.customers to authenticated;  -- slice 02's grants

create table customer_preference_events (
  id                    bigserial primary key,
  customer_id           uuid not null references customers(id) on delete cascade,
  preference            text not null check (preference in ('aftercare_email', 'aftercare_whatsapp')),
  to_value              boolean not null,
  source                text not null check (source in ('profile', 'checkout', 'staff', 'email_link', 'whatsapp_reply')),
  changed_by_profile_id uuid null references mp_staff(id) on delete set null,
  note                  text null check (length(note) <= 300),
  created_at            timestamptz not null default now()
);
```

- **Access.** `customer_preference_events` is service-role only and append-only.
- **One write path.** Every change goes through one SQL function,
  `set_aftercare_preference(customer_id, preference, value, source, profile_id, note)`. It
  updates the column and appends the event in one transaction, and writes nothing when the
  value is unchanged.
- **Slices 07 and 08 read these two columns.** Neither has an opt-out column of its own.

## Five ways to change it

### 1. Staff: the manual switch

This is the owner's ask. The Customer detail's **Contact and sign-in** card (slice 11) gets two
switches, *Aftercare by email* and *Aftercare by WhatsApp*.

- **Each shows its last change:** *"Off since 20 Oct: switched off by Mei: asked on
  WhatsApp."*
- **Turning one off:** one tap, plus an optional note.
- **Turning WhatsApp on asks for a note** saying how the customer agreed, for example *"agreed
  at the studio"*. Meta's opt-in must come from the customer. Staff record it; they do not
  decide it.
- **Permissions and audit.** Changing either needs `customers-edit` (slice 10). It writes the
  event and `recordAdminAction` (`customer.aftercare_preference`).

### 2. The customer: Profile

Two toggles on `/account`: *Emails after a purchase* and *WhatsApp messages after a purchase*.
They are written under the customer's own session, with source `profile`.

### 3. The customer: the email's link

Every Aftercare message's email footer says *"Stop these emails"*.

- **The link** carries a stateless HMAC token for the Customer.
- **GET** shows a confirm page with one button. It changes nothing, because mail scanners
  prefetch links.
- **POST** turns `aftercare_email` off, with source `email_link`.
- **Shared code.** It shares its token and confirm page with migration slice 07's unsubscribe,
  as `lib/email/preference-token.ts`, built by whichever lands first. The scope is separate: it
  never touches **Marketing consent**, and marketing unsubscribe never touches this.

### 4. The customer: WhatsApp STOP and START

The inbound webhook (`app/api/webhooks/whatsapp/route.ts`) gains two intents in
`parseInboundActions`.

- **STOP** (also *stop*, *unsubscribe*, *stop messages*) turns `aftercare_whatsapp` off for
  every Customer whose phone matches the sender (`phonesMatch`), with source `whatsapp_reply`.
  It replies once:
  > You won't get aftercare messages from Mpillow on WhatsApp any more. Reply START to turn them
  > back on. Reminders for a booked appointment still come.
- **START** turns it back on, which is an explicit opt-in. It replies with a confirmation.
- **The reply is allowed.** An inbound message opens WhatsApp's 24-hour window, so a free-text
  reply is fine there (`route.ts:105-112`).
- **Appointment reminders are not changed.** STOP covers aftercare only.

### 5. The customer: at checkout

An **unticked** checkbox sits under the phone field:

> Send me aftercare messages on WhatsApp: a review request after delivery and a yearly
> check-up. Reply STOP any time.

- **Writing it.** When ticked, the order write calls `set_aftercare_preference` with source
  `checkout`.
- **Best-effort.** A failure is logged and never blocks payment.

## The WhatsApp channel (used by slices 07 and 08)

It mirrors the partner WhatsApp notifications (`lib/whatsapp/partner-notify.ts`).

- **WhatsApp is additive and best-effort.** Email remains the record. Every "no" is a silent,
  counted skip.
- **The decision is pure.** `lib/whatsapp/aftercare-notify.ts` has
  `decideAftercareWhatsApp({ templateName, optedIn, phone, nonProdAllowed })`. It returns
  `send` or a skip:
  - `template_unconfigured`;
  - `opted_out`;
  - `no_mobile`;
  - `invalid_mobile` (`isValidPhone`);
  - `not_allowed_outside_production` (`isPhoneAllowed`, `lib/appointments/phone.ts:52`).
- **Ledger.** `customer_whatsapp`, with `unique (customer_id, template, entity_id)`, mirroring
  `partner_whatsapp` (`20260802000000:17-28`). Each row is claimed as `pending`, then marked
  `sent` or `failed`.
- **Sender.** `sendTemplateMessage` (`lib/appointments/whatsapp.ts:53`), from the utility
  sender (`WHATSAPP_PHONE_NUMBER_ID`). The copy's "message us" line names the staffed support
  number (`lib/contact.ts`). Those are two different numbers, so the template says which to
  write to.
- **Templates.** Their names come from env: `WHATSAPP_TEMPLATE_AFTERCARE_REVIEW` and
  `WHATSAPP_TEMPLATE_AFTERCARE_CHECKUP`. Until a name is set, WhatsApp is skipped and email
  still goes.

## Meta template approval (HITL)

1. The owner approves the copy for both templates. Each ends with *"Reply STOP to stop these
   messages."*
   - The review template carries a URL button with a dynamic suffix:
     `https://mpillow.com/r/review?t={{1}}`, slice 07's redirect, so WhatsApp clicks are
     recorded too.
   - The check-up template states the fee (slice 08).
2. Submit both in WhatsApp Manager. **Meta assigns the category.** A review request or a
   paid-visit check-up may be classed **Marketing** rather than **Utility**. Marketing costs
   more per message and is limited to opted-in people. Our opt-in covers the second point.
   Record the category Meta gave here.
3. Set the env names in production.

## Acceptance criteria

- [ ] All five ways write the column and exactly one event. A change to the same value writes
      nothing.
- [ ] A view-only role sees the switches and their history, and cannot change them.
- [ ] Turning WhatsApp on from the Admin Panel requires a note.
- [ ] A GET on the email link changes nothing. A POST turns aftercare email off, and leaves
      marketing consent untouched.
- [ ] STOP from a number turns WhatsApp off for every matching Customer and replies once. START
      turns it back on. An open appointment reminder for that number is unaffected.
- [ ] Ticking the checkout box opts in, and a failure there does not block payment.
- [ ] `decideAftercareWhatsApp` is covered for every skip reason. The ledger prevents a second
      send under concurrent runs.
- [ ] `./scripts/graphify update .` is run in the same commit.
