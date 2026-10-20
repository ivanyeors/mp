# 13 — Aftercare by email and WhatsApp, with a manual switch to turn them off

**Type:** AFK. Meta has approved the WhatsApp templates (owner, 2026-10-20). Their details are
recorded below before building.
**Blocked by:** 01, 10
**User stories:** 25, 26, 27, 28
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:email`, `area:admin`

## Decided

The owner decided on 2026-10-20:

- **Both channels.** The review request (slice 07) and the check-up reminder (slice 08) go by
  **email and WhatsApp**.
- **A manual switch.** When a customer wants the reminders to stop, Staff can switch them off
  for that customer.
- **Customers change it themselves in one place only:** their Profile, once signed in. There
  is no unsubscribe link in the email, no STOP or START keyword on WhatsApp, and no checkbox at
  checkout.
- **The WhatsApp templates are approved by Meta.**

## Goal

One place decides whether a **Customer** gets **Aftercare messages** by email and by
WhatsApp. Two ways change it:

- the customer, in their Profile;
- Staff, with the manual switch on the Customer page, for anyone who asks by email reply, on
  WhatsApp, or in person.

Every change records who made it, how, and when.

## Two channels, two defaults

- **Email: on by default.** A service message with an opt-out (ADR 0027 f).
- **WhatsApp: off until the customer opts in.** Meta requires a person's opt-in before a
  business starts a conversation. The precedent is the partners' `notify_whatsapp`, which
  defaults to false while email stays always-on (`20260802000000_partner_notify_whatsapp.sql:1-12`).
- **What that means in practice.** With no checkout checkbox, WhatsApp reaches only customers
  who turned it on in their Profile, or who told Staff they agree. Expect most aftercare to go
  by email.

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
  source                text not null check (source in ('profile', 'staff')),
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
- **Another way to change it later** needs a new value in the `source` check.

## Two ways to change it

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

### 2. The customer: Profile, once signed in

`/account` gets two toggles: *Emails after a purchase* and *WhatsApp messages after a
purchase*.

- **Who is changing it.** A server action resolves the Customer from the session, never from
  the request. It calls `set_aftercare_preference` with source `profile`.
- **Customers without an account.** Signing in with the emailed code binds them to their
  Customer (`linkCustomerToAuthUser`), and then they see the toggles.
- **The WhatsApp toggle says what they will get:** *"A review request after delivery, and a
  yearly check-up for a Premium Mpillow."*
- **A mobile is needed.** If `customers.phone` is missing or fails `isValidPhone`, turning
  WhatsApp on asks for the number first. The Profile already edits it.

## How each message says how to stop

- **Email footer:** *"You're getting this because you bought from Mpillow. To stop these
  emails, turn them off in your account."*
  - The link goes to `/account`, through Sign in.
  - Reply-To is the support address. A reply asking to stop is handled with Staff's switch.
- **WhatsApp:** the approved template's closing line. It should name the account page or the
  support number.
- **A "stop" reply to the WhatsApp sender.**
  - **The problem.** Today the webhook drops any message it does not recognise
    (`app/api/webhooks/whatsapp/route.ts:103`), so a customer who replies *STOP* hears nothing.
    Meta requires that a request to stop is honoured. A request that is dropped risks the
    customer blocking the number. That lowers its quality rating, and the same number sends
    appointment reminders.
  - **The fix.** `parseInboundActions` gains one intent, `stop_request` (*stop*,
    *unsubscribe*, *stop messages*). It does not flip the switch, because customers change it in
    their Profile (owner). It turns the reply into a request for Staff instead:
    - it records a row in `customer_stop_requests` for every Customer whose phone matches the
      sender (`phonesMatch`);
    - it replies once, inside the 24-hour window the inbound message opened:
      > Thanks, we'll switch off aftercare messages for you. You can also turn them off yourself
      > in your account at mpillow.com/account.
    - while a request is open, `decideAftercareWhatsApp` skips that Customer
      (`stop_requested`), so nothing goes out before Staff act;
    - the Contact card shows *"Asked to stop on WhatsApp, 3 Nov"* beside the switch, and the
      Aftercare card counts open requests, with links.
  - **Closing a request.** Switching WhatsApp off closes it, inside `set_aftercare_preference`.
    Staff can also dismiss it, for example when *stop* meant something else.
  - **Where it runs.** It is handled before the appointment-reminder lookup, and never touches
    a reminder. With no matching Customer, it sends the same reply and records nothing.

  ```sql
  create table customer_stop_requests (
    id          bigserial primary key,
    customer_id uuid not null references customers(id) on delete cascade,
    received_at timestamptz not null default now(),
    closed_at   timestamptz null,
    closed_how  text null check (closed_how in ('switched_off', 'dismissed'))
  );
  ```

  It is service-role only, like the events table.

## The WhatsApp channel (used by slices 07 and 08)

It mirrors the partner WhatsApp notifications (`lib/whatsapp/partner-notify.ts`).

- **WhatsApp is additive and best-effort.** Email remains the record. Every "no" is a silent,
  counted skip.
- **The decision is pure.** `lib/whatsapp/aftercare-notify.ts` has
  `decideAftercareWhatsApp({ templateName, optedIn, stopRequested, phone, nonProdAllowed })`.
  It returns `send` or a skip:
  - `template_unconfigured`;
  - `opted_out`;
  - `stop_requested`;
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

## The approved templates

Meta has approved them (owner, 2026-10-20). **Before building,** record here for each one:

- its name and language;
- the category Meta gave it, Utility or Marketing;
- the body variables, in order;
- the buttons.

The code sends parameters that match this record, and production env takes the approved
names. Check each template against slices 07 and 08:

- **Review request.** The button is either a dynamic suffix or a fixed link.
  - With a dynamic suffix (`https://mpillow.com/r/review?t={{1}}`), WhatsApp clicks are recorded
    by slice 07's redirect.
  - With a fixed Google link, WhatsApp clicks are not counted. That is acceptable, and the Aftercare
    card then shows clicks for email only.
- **Check-up.** If the fee is a variable, Costings fills it at send time. If the template has
  the price written into it, record that price here.
  - The job sends WhatsApp only while Costings' fee equals the recorded price.
  - Otherwise it sends email only, and the Aftercare card says *"WhatsApp check-up paused: the
    template says S$30, Costings says S$35. Resubmit the template."*
- **How to stop.** The closing line names the account page or the support number. If it says
  *Reply STOP*, the `stop_request` handling above answers it.
- **Marketing.** If Meta classed one as Marketing, it costs more per message and may go only to
  opted-in people, which every recipient here is.

## Acceptance criteria

- [ ] Both ways write the column and exactly one event. A change to the same value writes
      nothing.
- [ ] The Profile toggles change only the signed-in Customer's own row, whatever the request
      body says.
- [ ] A view-only role sees the switches and their history, and cannot change them.
- [ ] Turning WhatsApp on from the Admin Panel requires a note.
- [ ] A *STOP* reply records one open request per matching Customer and replies once. It
      changes no preference, and no aftercare WhatsApp goes to that Customer until Staff switch
      it off or dismiss the request. An open appointment reminder for that number is unaffected.
- [ ] `decideAftercareWhatsApp` is covered for every skip reason. The ledger prevents a second
      send under concurrent runs.
- [ ] With a recorded template price that differs from Costings, the check-up goes by email
      only, and the card says why.
- [ ] `./scripts/graphify update .` is run in the same commit.
