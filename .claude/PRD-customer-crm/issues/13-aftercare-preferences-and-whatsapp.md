# 13 — Aftercare by email and WhatsApp, with a manual switch to turn them off

**Issue:** [#290](https://github.com/ivanyeors/mp/issues/290) (parent #277)
**Type:** AFK, plus one HITL step: submitting the two new WhatsApp templates with the existing
script and waiting for Meta's review (usually minutes).
**Blocked by:** 01, 10
**User stories:** 25, 26, 27, 28
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:email`, `area:admin`, `area:customer-accounts`

## Decided

The owner decided on 2026-10-20:

- **Both channels.** The review request (slice 07) and the check-up reminder (slice 08) go by
  **email and WhatsApp**.
- **A manual switch.** When a customer wants the reminders to stop, Staff can switch them off
  for that customer.
- **Customers change it themselves in one place only:** their Profile, once signed in. There
  is no one-click unsubscribe link in the email, no automatic STOP or START keyword on
  WhatsApp, and no checkbox at checkout.
- **Meta approval.** The owner confirmed it is done. In the code, that is the WhatsApp Business
  account and its four approved appointment templates, in `scripts/whatsapp-create-templates.ts`:
  `appointment_day_before_v2`, `appointment_morning_of`, `appointment_cancelled_v2` and
  `appointment_confirmation`. **No aftercare template exists yet.** This slice adds two to
  the same script and submits them to the same account.

## Goal

One place decides whether a **Customer** gets **Aftercare messages** by email and by
WhatsApp. Two ways change it:

- the customer, in their Profile;
- Staff, with the manual switch on the Customer page, for anyone who asks by email reply, on
  WhatsApp, or in person.

Every change records who made it, how, and when.

## Two channels, two defaults

- **Email: on by default.** A service message with an opt-out (ADR 0027 f). The check-up email
  also needs **Marketing consent**, because Singapore treats a paid visit as direct marketing
  (slice 08).
- **WhatsApp: off until the customer opts in.**
  - Meta requires opt-in before a business starts a conversation. The precedent is the partners'
    `notify_whatsapp`, which defaults to false while email stays always on
    (`20260802000000_partner_notify_whatsapp.sql:1-12`).
  - The check-up is a "specified message" under the PDPA's Do Not Call rules. Clear opt-in wording
    that names it is what lets us skip a Do Not Call register check.
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
  wording               text null,          -- the opt-in text the customer saw, when turning on
  created_at            timestamptz not null default now()
);

create table customer_whatsapp (
  id          bigserial primary key,
  customer_id uuid not null references customers(id) on delete cascade,
  template    text not null,                 -- 'aftercare.review_request', 'aftercare.checkup_12m'
  entity_id   uuid not null,                 -- the Customer (review) or the Order (check-up)
  phone       text not null,                 -- E.164, as sent
  status      text not null check (status in ('pending', 'sent', 'failed')),
  wa_id       text null,
  last_error  text null,
  sent_at     timestamptz null,
  created_at  timestamptz not null default now(),
  unique (customer_id, template, entity_id)
);
```

- **Access.**
  - Both tables are server-only: RLS on, no policy, `revoke all … from anon, authenticated`.
  - `customer_preference_events` is append-only.
- **One write path.**
  - Every preference change goes through one SQL function,
    `set_aftercare_preference(customer_id, preference, value, source, profile_id, note, wording)`.
  - It updates the column and appends the event in one transaction, and writes nothing when the
    value is unchanged.
  - It is SECURITY DEFINER with `revoke execute … from anon, authenticated`
    (`20260917033807:39-40`).
- **The opt-in is evidence.** Turning WhatsApp on stores the exact `wording` the customer saw, with
  the time. That is the "evidenced" consent the PDPA asks for.
- **Slices 07 and 08 read these columns.** Neither has an opt-out column of its own. Their email
  goes in `customer_emails` (migration slice 05) and their WhatsApp in `customer_whatsapp`.

## Two ways to change it

### 1. Staff: the manual switch

This is the owner's ask. The Customer detail's **Contact and sign-in** card (slice 11) gets two
switches, *Aftercare by email* and *Aftercare by WhatsApp*.

- **Each shows its last change:** *"Off since 20 Oct: switched off by Mei: asked on
  WhatsApp."*
- **Turning one off:** one tap, plus an optional note.
- **Turning WhatsApp on asks for a note** saying how and when the customer agreed, and to what:
  for example *"agreed at the studio on 20 Oct to the review request and the paid yearly
  check-up"*.
  - Meta's opt-in must come from the customer. Staff record it; they do not decide it.
  - Counsel confirms at sign-off (slice 09) that a Staff note is enough evidence for the check-up
    under the Do Not Call rules.
- **Permissions and audit.** Changing either needs `customers-edit` (slice 10). It writes the
  event and `recordAdminAction` (`customer.aftercare_preference`).

### 2. The customer: Profile, once signed in

`/account` today shows the phone and changes nothing about the Customer
(`app/[lang]/account/page.tsx:37,59-61`). This slice adds an **Aftercare messages** card with two
toggles.

- **Who is changing it.** A server action resolves the Customer from the session
  (`getCurrentCustomerId`, `lib/shop/customer-addresses.ts:30`), never from the request. It calls
  `set_aftercare_preference` with source `profile`.
- **Customers without an account.** Signing in with the emailed code binds them to their
  Customer (`linkCustomerToAuthUser`), and then they see the toggles.
- **The email toggle:** *Emails after a purchase*.
- **The WhatsApp toggle states exactly what they agree to**, and that text is stored as
  `wording`:
  > Mpillow may WhatsApp me at {mobile} with a review request after delivery and, for a Premium
  > Mpillow, a yearly reminder about a paid re-adjustment visit. I can turn this off here at any
  > time.
- **A mobile is needed.** `customers.phone` is written only at checkout today. If it is missing
  or fails `isValidPhone`, turning WhatsApp on first asks for the number and saves it to
  `customers.phone`, normalised by `normalizePhone`. This is the Profile's first editable field.

## How each message says how to stop

- **Email footer:** *"You're getting this because you bought from Mpillow. To stop these
  emails, turn them off in your account, or reply to this email and we'll do it for you."*
  - The account link goes to `/account`, through Sign in.
  - Reply-To is the support address, which must be watched. A reply asking to stop is handled
    with Staff's switch within 10 business days.
  - **Why the reply line.** Singapore's Spam Control Act says a commercial email sent without
    consent, in bulk, must name an email address the person can unsubscribe through. It sets
    10 business days. A Profile page behind a sign-in does not meet that on its own. This keeps
    Profile as the only switch customers flip themselves.
- **WhatsApp:** the template's closing line, *"To stop these messages, turn them off in your
  Mpillow account, or tell our team."*
- **A "stop" reply to the WhatsApp sender.**
  - **The problem.** Since #258 and #259 the webhook records every inbound message in
    `whatsapp_inbound` and answers it. A *STOP* is `unknown`, so it gets
    `guestText.autoReply`, at most once per 12 hours (`app/api/webhooks/whatsapp/route.ts`,
    `lib/appointments/messages.ts`). That reply says the number *"only sends automated
    appointment messages"*, which stops being true, and nothing treats the STOP as a request.
    Meta requires that a request to stop is honoured, on or off WhatsApp. A request that is
    ignored invites a block. A block lowers the quality rating of the number that also sends
    appointment reminders.
  - **The fix.**
    - `parseInboundActions` (`lib/appointments/whatsapp.ts:302`) gains a `stop` intent for an
      exact text match on *stop*, *unsubscribe*, *stop messages* or *stop sending*, like
      `CANCEL_WORDS`.
    - It does not flip the switch, because customers change it in their Profile (owner). The
      webhook answers it before the reminder lookup, every time, with no cooldown:
      > Thanks, we'll switch off aftercare messages for you. You can also turn them off yourself
      > in your Mpillow account.
  - **An open stop request is derived, not stored.**
    - A Customer has one when the latest `whatsapp_inbound` row of kind `stop` from a number
      matching their phone is newer than their latest `aftercare_whatsapp` event. No new table.
    - While one is open, `decideAftercareWhatsApp` skips them (`stop_requested`).
    - The Contact card shows *"Asked to stop on WhatsApp, 3 Nov"* beside the switch, and the
      Aftercare card counts open requests.
    - Any later preference change closes it: Staff switching WhatsApp off, or the customer
      choosing in their Profile.
  - **The generic auto-reply** changes from *"only sends automated appointment messages"* to
    *"only sends automated messages from Mpillow"*. It is still at most once per 12 hours.
- **"Cancel" after an aftercare message.**
  - `CANCEL_WORDS` (`lib/appointments/whatsapp.ts:292`) cancels the phone's next upcoming
    appointment. After an aftercare message, a customer who types *cancel* to mean "stop these"
    would cancel a booked re-adjustment.
  - So a bare *cancel*, *cancel please* or *please cancel* asks a question instead of cancelling
    when the phone's latest aftercare send (`customer_whatsapp.sent_at`) is newer than the open
    reminder's `last_outbound_at`:
    > Do you want to cancel your appointment on {when}? Reply "cancel appointment" to cancel
    > it. To stop aftercare messages, reply "stop".
  - *cancel appointment* and *cancel booking* still cancel at once.

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
- **Ledger.** `customer_whatsapp`, claimed as `pending`, then marked `sent` or `failed`. A failed
  WhatsApp send is not retried: email carries the message.
- **WhatsApp's own marketing switch.** A person can stop marketing messages from a business
  inside WhatsApp. A marketing template to them then fails with error `131050`.
  - The ledger records `last_error = 'whatsapp_marketing_off'`.
  - The Contact card shows *"Turned off marketing messages in WhatsApp"*.
  - Our switch is left alone. It is their WhatsApp setting, not ours.
- **Sender.** The utility sender (`WHATSAPP_PHONE_NUMBER_ID`).
  - It sends through `sendTemplateMessage` (`lib/appointments/whatsapp.ts:55`). Today that sends
    body parameters only, so it gains an optional URL-button parameter:
    `{ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text }] }`.
  - The copy's "message our team" line names the staffed sales line (`lib/contact.ts`), never the
    sender. Those are different numbers on purpose
    (`.claude/PRD-whatsapp-appointment-confirm/OPS-CHECKLIST.md` §0).
- **The sender must reach real customers.** Aftercare goes only to customers, never to the test
  recipient list. Prove the sender with `scripts/whatsapp-test.ts` to a phone not on that list
  (OPS-CHECKLIST §0.5) before switching aftercare WhatsApp on.
- **Templates.** Names come from env: `WHATSAPP_TEMPLATE_AFTERCARE_REVIEW` and
  `WHATSAPP_TEMPLATE_AFTERCARE_CHECKUP`, added to `.env.example`. Until a name is set, WhatsApp
  is skipped and email still goes.

## The two templates

They are added to `scripts/whatsapp-create-templates.ts`, where the approved appointment
templates already live.

- **The script gains two things:** a `category` per template, since it hardcodes `UTILITY`
  today, and a URL button with one variable at the end of the URL.
- **Both are submitted as `MARKETING`.**
  - Meta's rules make a utility template non-promotional *and* specific to something the
    customer did or asked for.
  - A paid-visit reminder is a renewal-style offer, which Meta lists as marketing. A request
    for a public review is very likely marketing too.
  - Since April 2025, Meta approves a misfiled template as Marketing anyway. Repeated misfiling
    risks enforcement on the account, so file them honestly.
  - Marketing costs about 4–5× utility per message (about S$0.09 against S$0.02). At tens a day,
    that is cents.

Draft copy, for the owner to approve before submitting. Every body starts and ends with fixed
text, and no variable sits next to another:

**`aftercare_review_request`** (MARKETING, `en`)

> Hi {{1}}, thank you for choosing Mpillow for your {{2}}. If you have a minute, a Google review
> helps other people find a pillow that fits them.
>
> Need anything else, like a re-adjustment or a spare cover? Message our team on WhatsApp at
> {{3}}.
>
> To stop these messages, turn them off in your Mpillow account, or tell our team.

- Examples: `Ivan`, `Premium Mpillow`, `+65 8780 5311`.
- URL button **Write a Google review**: `https://mpillow.com/r/review?t={{1}}`. The suffix is
  slice 07's token, so WhatsApp clicks are recorded, and the button points at our own domain
  rather than Google's redirect link.

**`aftercare_checkup`** (MARKETING, `en`)

> Hi {{1}}, it has been about a year since your {{2}} arrived. A re-adjustment keeps it fitting
> you as your sleep changes.
>
> A re-adjustment is a paid visit: {{3}}, paid when you book. Tap below to pick a time, or message
> our team on WhatsApp at {{4}}.
>
> To stop these messages, turn them off in your Mpillow account, or tell our team.

- Examples: `Ivan`, `Premium Mpillow`, `S$30`, `+65 8780 5311`.
- The fee is a variable, read from Costings at send time (slice 08). It is never written into
  the template.
- URL button **Book a re-adjustment**:
  `https://mpillow.com/appointments?type=readjustment&item={{1}}`, with the order item id.

**Tooling.**

- **Preflight.** `scripts/whatsapp-preflight.ts` checks both templates: approved, language, 3
  and 4 body parameters, and the URL button. It also prints the category Meta gave.
- **Preview.** `scripts/whatsapp-preview.ts` sends both to one phone with sample data, and also
  the stop reply and the cancel question.
- **Copy.** The free-text replies live in `lib/appointments/messages.ts` beside the rest.

## Acceptance criteria

- [ ] Both ways of changing a preference write the column and exactly one event. A change to the
      same value writes nothing. Turning WhatsApp on stores the wording shown.
- [ ] The Profile toggles change only the signed-in Customer's own row, whatever the request
      body says. Turning WhatsApp on with no valid mobile asks for one first.
- [ ] A view-only role sees the switches and their history, and cannot change them.
- [ ] Turning WhatsApp on from the Admin Panel requires a note.
- [ ] A *STOP* gets the stop reply every time and changes no preference. No aftercare WhatsApp
      goes to a matching Customer until a later preference change. An open appointment
      reminder for that number is unaffected.
- [ ] A bare *cancel* right after an aftercare message asks a question and cancels nothing. The
      same word with no aftercare send since the last reminder cancels, as today.
- [ ] The generic auto-reply no longer says "appointment messages".
- [ ] `decideAftercareWhatsApp` is covered for every skip reason. The ledger prevents a second
      send under concurrent runs. A `131050` failure is recorded as `whatsapp_marketing_off`.
- [ ] `sendTemplateMessage` sends a URL-button parameter when given one, and is unchanged when
      not.
- [ ] Preflight passes with both templates approved. Their category is recorded here.
- [ ] `./scripts/graphify update .` is run in the same commit.
