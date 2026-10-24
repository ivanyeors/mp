# 13 — Aftercare by email and WhatsApp, with a manual switch to turn them off

**Issue:** [#290](https://github.com/ivanyeors/mp/issues/290) (parent #277)
**Type:** AFK, plus one HITL step: submitting the two new WhatsApp templates with the existing
script and waiting for Meta's review (usually minutes).
**Status:** built in `d1dbf95` on `claude/shopify-migration-plan-izv7fo`
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
- **Both templates are submitted as Utility**, and Meta has the final say (below).
- **The WhatsApp copy is approved** (owner, 2026-10-20), word for word as written in this slice:
  - the two templates;
  - the stop reply, the cancel question and the reworded auto-reply;
  - the Profile's WhatsApp opt-in wording.

  Changing any of it later needs the owner again. A template change also means a new template
  name, because editing an approved template sends it back to Meta's review.

## Goal

One place decides whether a **Customer** gets **Aftercare messages** by email and by
WhatsApp. Two ways change it:

- the customer, in their Profile;
- Staff, with the manual switch on the Customer page, for anyone who asks by email reply, on
  WhatsApp, or in person.

Every change records who made it, how, and when.

## Two channels, two defaults

- **Email: on by default.** A service message with an opt-out (ADR 0028 f). The check-up email
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
  inside WhatsApp. If Meta ever files one of our templates as Marketing, a send to them fails
  with error `131050`.
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
templates already live. The script gains a URL button with one variable at the end of the URL.
It already files every template as `UTILITY`.

**Both are submitted as `UTILITY`** (owner, 2026-10-20): they are service reminders about a
product the customer owns, not promotions.

- **Meta's test for Utility.** A template must be:
  - non-promotional, with no persuasive intent;
  - and specific to something the customer did, or asked for.
- **Meta decides the category, not us.**
  - If Meta disagrees, it approves the template as **Marketing** instead of rejecting it, and
    says so in WhatsApp Manager.
  - We can ask for a review within 60 days.
  - Nothing in the code depends on the category. Preflight prints what Meta gave, and this
    slice records it.
- **The copy is written to pass that test.**
  - Each message names the customer's own order and product.
  - It states facts, not a pitch.
  - It names no other product.
  - The "message our team" line is a plain offer of help.
- **If one lands as Marketing:**
  - it costs about S$0.09 a message instead of S$0.02, which is cents a day at our volume;
  - it is not delivered to people who turned off marketing messages in WhatsApp (error
    `131050`), which the ledger records as `whatsapp_marketing_off`.

The copy below is **approved by the owner (2026-10-20)**; submit it exactly as written. Every
body starts and ends with fixed text, and no two variables sit side by side:

**`aftercare_review_request`** (UTILITY, `en`)

> Hi {{1}}, your order {{2}} ({{3}}) was delivered on {{4}}. We'd love to hear how it's going: you
> can leave us a Google review with the button below.
>
> If you need anything else, message our team on WhatsApp at {{5}}.
>
> To stop these messages, turn them off in your Mpillow account, or tell our team.

- Examples: `Ivan`, `#1042`, `Premium Mpillow`, `3 Nov 2026`, `+65 8780 5311`.
- URL button **Write a Google review**: `https://mpillow.com/r/review?t={{1}}`, example
  `https://mpillow.com/r/review?t=Zx81kQ`.
  - The suffix is slice 07's token, so WhatsApp clicks are recorded.
  - The button points at our own domain rather than Google's redirect link.

**`aftercare_checkup`** (UTILITY, `en`)

> Hi {{1}}, your {{2}} from order {{3}} is due for its yearly re-adjustment, which keeps it
> fitted to you.
>
> A re-adjustment is a paid visit: {{4}}, paid when you book. Use the button below to pick a time,
> or message our team on WhatsApp at {{5}}.
>
> To stop these reminders, turn them off in your Mpillow account, or tell our team.

- Examples: `Ivan`, `Premium Mpillow`, `#1042`, `S$30`, `+65 8780 5311`.
- The fee is a variable, read from Costings at send time (slice 08). It is never written into
  the template.
- URL button **Book a re-adjustment**:
  `https://mpillow.com/appointments?type=readjustment&item={{1}}`, with the order item id.
- A customer with no first name on file is greeted *"Hi there"*.

**Tooling.**

- **Preflight.** `scripts/whatsapp-preflight.ts` checks both templates: approved, language, 5
  body parameters each, and the URL button. It also prints the category Meta gave.
- **Preview.** `scripts/whatsapp-preview.ts` sends both to one phone with sample data, and also
  the stop reply and the cancel question.
- **Copy.** The free-text replies live in `lib/appointments/messages.ts` beside the rest. The
  approved wording, with sample values filled in:
  - **stop reply:** *"Thanks, we'll switch off aftercare messages for you. You can also turn them
    off yourself in your Mpillow account."*
  - **cancel question:** *"Do you want to cancel your appointment on Tue 3 Nov 2026 at 14:00?
    Reply "cancel appointment" to cancel it. To stop aftercare messages, reply "stop"."*
  - **auto-reply:** *"Hi! This number only sends automated messages from Mpillow, so no one here
    will see your reply. Please message our team on WhatsApp at +65 8780 5311."*

## Acceptance criteria

- [x] Both ways of changing a preference write the column and exactly one event. A change to the
      same value writes nothing. Turning WhatsApp on stores the wording shown.
- [x] The Profile toggles change only the signed-in Customer's own row, whatever the request
      body says. Turning WhatsApp on with no valid mobile asks for one first.
- [x] A view-only role sees the switches and their history, and cannot change them.
- [x] Turning WhatsApp on from the Admin Panel requires a note.
- [x] A *STOP* gets the stop reply every time and changes no preference. No aftercare WhatsApp
      goes to a matching Customer until a later preference change. An open appointment
      reminder for that number is unaffected.
- [x] A bare *cancel* right after an aftercare message asks a question and cancels nothing. The
      same word with no aftercare send since the last reminder cancels, as today.
- [x] The generic auto-reply no longer says "appointment messages".
- [x] `decideAftercareWhatsApp` is covered for every skip reason. The ledger prevents a second
      send under concurrent runs. A `131050` failure is recorded as `whatsapp_marketing_off`.
- [x] `sendTemplateMessage` sends a URL-button parameter when given one, and is unchanged when
      not.
- [ ] Preflight passes with both templates approved. The category Meta gave each is
      recorded here. — _both approved, both Utility (preflight, 2026-10-21). Preflight still
      warns that the two env vars are unset; tick this once it runs clean with them set._
  - `aftercare_review_request`: **APPROVED**, category **UTILITY**.
  - `aftercare_checkup`: **APPROVED**, category **UTILITY**.
- [x] `./scripts/graphify update .` is run in the same commit.

## Build notes

Built on `claude/shopify-migration-plan-izv7fo` @ `0ae10de` (CRM 01 and CRM 10 merged).

**What was built**

- **Migration** `supabase/migrations/20261020114000_aftercare_preferences.sql`:
  - `customers.aftercare_email` (default true) and `customers.aftercare_whatsapp` (default
    false), one `alter table` each so the migration scans see both columns;
  - `grant select (aftercare_email, aftercare_whatsapp) on public.customers to authenticated`;
  - `customer_preference_events`:
    - server-only: RLS on, no policy, `revoke all` from anon and authenticated;
    - append-only, enforced by a trigger. It refuses UPDATE and DELETE unless they come from a
      foreign key's own action (`pg_trigger_depth() > 1`), such as a deleted Customer or a
      deleted Staff profile;
  - `set_aftercare_preference(...)`:
    - SECURITY DEFINER, with a row lock;
    - writes the column and one event, writes nothing for the same value, and returns whether
      it changed;
    - refuses WhatsApp on without `wording` (source `profile`) or a note (source `staff`);
    - `revoke execute` from public, anon and authenticated; `grant execute` to service_role;
  - `customer_whatsapp`, the ledger:
    - server-only, with `unique (customer_id, template, entity_id)`;
    - indexes for the webhook's two lookups (phone with `sent_at`, and `wa_id`).
- **One write path, and the reads:** `lib/aftercare/preferences.ts`.
  - It has `setAftercarePreference`, `readAftercareView`, `readWhatsAppGate`,
    `readProfileAftercare` and `listOpenStopRequests`.
  - The pure rules and the approved copy are in `lib/aftercare/state.ts`: `isStopRequestOpen`,
    `describeSwitch`, `aftercareWhatsAppWording`, `AFTERCARE_EMAIL_LABEL`, and
    `AFTERCARE_EMAIL_FOOTER` for slices 07 and 08.
- **The WhatsApp channel for slices 07 and 08:** `lib/whatsapp/aftercare-notify.ts`.
  - `decideAftercareWhatsApp`: pure, with all six skips.
  - `notifyAftercareWhatsApp`: claims the row as `pending`, sends, and marks it `sent` or
    `failed`. A failed send is never retried.
  - `aftercareSendError`: maps 131050 to `whatsapp_marketing_off`.
  - `latestAftercareSentAt` and `recordAftercareDeliveryFailure`, for the webhook.
  - The ledger keys are `aftercare.review_request` and `` aftercare.checkup_<n>m ``.
- **The two templates:** `lib/whatsapp/aftercare-templates.ts`.
  - It holds the approved copy, the URL buttons and the examples.
  - It also has `reviewRequestTemplateParams` and `checkupTemplateParams`. They set the
    parameter order, the "Hi there" greeting, the SGT delivery date and the staffed line.
  - The check-up builder throws when there is no fee.
- **`sendTemplateMessage`:**
  - takes `{ urlButtonParam }` and adds the URL button component
    (`{ type: "button", sub_type: "url", index: "0", ... }`);
  - without it, the payload is exactly what it was;
  - a refused send now throws `WhatsAppSendError` with Meta's `code`. The error message is
    unchanged.
- **Inbound** (`lib/appointments/whatsapp.ts`, `app/api/webhooks/whatsapp/route.ts`):
  - a `stop` intent: an exact match on one of the four words. It is answered with the stop reply
    before the reminder lookup, every time, with no cooldown, and nothing else changes;
  - `cancel` carries `bare`. A bare cancel gets the cancel question when `askBeforeCancel` finds
    an aftercare send newer than the reminder's `last_outbound_at`;
  - a `failed` status on the webhook is also recorded on the aftercare ledger.
- **Copy** (`lib/appointments/messages.ts`): `guestText.stopReply`, `guestText.cancelQuestion`
  and the reworded `autoReply`, word for word.
- **Staff's manual switch:**
  - **The route**, `GET` and `POST /api/shop/customers/[id]/aftercare`:
    - GET checks `customers`. POST checks `customers-edit`, and the guard test finds it.
    - POST requires a note to turn WhatsApp on. It records the working-as Staff profile.
    - When something changed, POST writes `recordAdminAction` (`customer.aftercare_preference`).
  - **The card**, `app/[lang]/settings/customers/[id]/aftercare-card.tsx`:
    - two switches, each with its last change ("Off since 20 Oct: switched off by Mei: asked on
      WhatsApp.");
    - the open STOP notice, the 131050 notice and the history;
    - a note dialog, where the note is required to turn WhatsApp on;
    - the switches are disabled without `customers-edit`.
- **The Profile:** `app/[lang]/account/aftercare-preferences.tsx`, with the server action
  `app/[lang]/account/actions.ts`.
  - The Customer comes from the session (`getCurrentCustomerId`), never from the body.
  - With no valid mobile on file, the toggle asks for one and saves it normalised.
  - The stored wording carries that number.
- **Scripts:**
  - `whatsapp-create-templates.ts`: URL-button support and both templates.
  - `whatsapp-preflight.ts` checks each template: approved, language, 5 params, and a URL button
    ending in `{{1}}`. It prints the category, and only warns while the env var is unset.
  - `whatsapp-preview.ts`: sends both templates, the stop reply and the cancel question.
  - `pnpm typecheck` excludes the scripts, so they were checked separately with `tsc`, and
    pass.
  - The create script was **not run against Meta**.
- **Env:** `WHATSAPP_TEMPLATE_AFTERCARE_REVIEW` and `WHATSAPP_TEMPLATE_AFTERCARE_CHECKUP` in
  `.env.example`.

**Column grants (CRM 02)**

- **Both approaches are used.** The Profile reads the switches server-side with the service
  role, keyed by the session's own Customer (`readProfileAftercare`), so it needs no grant. The
  migration also adds the slice's `grant select (aftercare_email, aftercare_whatsapp) on
  customers to authenticated`.
- **What CRM 02 must do.** A table-level `revoke select` that runs after these grants also drops
  them. So if CRM 02's migration sorts after this one, its grant list must name both columns.
- **The app is safe either way.**

**Database check** (`mp_c13`, Postgres 16 with the Supabase stubs)

All 155 migrations apply. Checked in psql:

- **The one write function:**
  - a change writes the column and one event;
  - the same value writes nothing and returns false;
  - WhatsApp on is refused without wording (Profile) or a note (Staff);
  - an unknown preference, a missing Customer and a note over 300 characters are refused.
- **The events table:**
  - UPDATE and DELETE are refused;
  - a deleted Customer cascades;
  - a deleted Staff profile nulls `changed_by_profile_id`.
- **Grants:**
  - anon and authenticated cannot execute the function or read either table; service_role can;
  - authenticated reads its own two columns through the column grant, even after a simulated
    CRM 02 revoke.
- **Concurrency:**
  - three concurrent ledger claims leave exactly one row;
  - three concurrent identical preference changes write exactly one event.

**Tests added**

- `lib/aftercare/__tests__/state.test.ts`: the approved Profile copy and footer, the open-STOP
  rule and the status lines.
- `lib/aftercare/__tests__/preferences.test.ts`: the RPC arguments, one event per change, an
  open STOP and a closed one, and the view.
- `lib/whatsapp/__tests__/aftercare-notify.test.ts`:
  - every skip reason, and their order;
  - the env names;
  - 131050 at send and on the webhook;
  - one send across three concurrent runs;
  - a failure not retried;
  - sending resumes after a later change.
- `lib/whatsapp/__tests__/aftercare-templates.test.ts`: the approved copy pinned word for word,
  Meta's rules, and the parameter builders.
- `lib/appointments/__tests__/whatsapp-aftercare.test.ts`:
  - the stop intent, and bare and named cancels;
  - `askBeforeCancel`;
  - the exact reply copy;
  - `sendTemplateMessage` with and without the URL button.
- `app/api/webhooks/whatsapp/__tests__/route-aftercare.test.ts`:
  - a STOP gets the reply every time, with no cooldown, and the reminder is untouched;
  - a bare cancel asks after an aftercare message and cancels otherwise;
  - a named cancel always cancels;
  - the auto-reply;
  - a late failure reaches the ledger.
- `app/api/shop/customers/__tests__/aftercare-route.test.ts`:
  - a view-only role reads, and gets a 403 on a write;
  - the editor and the owner write the column, one event and an audit row;
  - the same value writes nothing;
  - WhatsApp on needs a note;
  - a note over 300 characters is refused.
- `app/[lang]/account/__tests__/aftercare-action.test.ts`:
  - only the session's own row changes;
  - the wording is stored;
  - the mobile is asked for, saved and normalised;
  - nothing changes without a session.
- Two render tests:
  - `app/[lang]/settings/customers/__tests__/aftercare-card-render.test.tsx`: a view-only role
    sees disabled switches and the history;
  - `app/[lang]/account/__tests__/aftercare-preferences-render.test.tsx`: the Profile card.

**Deviations**

- **There is no Contact and sign-in card yet.**
  - Slice 11 is not built.
  - The two switches sit in their own *Aftercare* card in the Customer detail's right column,
    with its own fetch.
  - Slice 11 can move them into its card.
- **"The Aftercare card counts open requests".**
  - That card belongs to slice 07 (Customers page, Settings tab), and it does not exist yet.
  - `listOpenStopRequests()` is built and tested for it.
- **An open STOP request needs WhatsApp to be on.**
  - With WhatsApp already off there is nothing to pause.
  - Staff could not close such a request either, because switching off again writes no event.
  - Sending is unaffected: `opted_out` is decided before `stop_requested`.
- **`nonProdAllowed` is a predicate**, `(e164) => boolean` (`isPhoneAllowed`). The decision
  stays pure and is handed the normalised number.
- **Extra skips outside the pure decision.** `notifyAftercareWhatsApp` also skips with
  `transport_unconfigured`, `no_customer` or `duplicate`, like the partner channel.
- **The Appointments kill switch still silences every reply,** the stop reply included
  (Settings → Appointments, WhatsApp off).
  - The STOP is still recorded as kind `stop`.
  - So the open request is derived either way.
- **A failed aftercare lookup on a bare cancel asks instead of cancelling.** A question can be
  asked again; a cancelled booking is harder to undo.
- **The template copy lives in `lib/whatsapp/aftercare-templates.ts`,** not inline in the
  script.
  - A test pins the approved text, and preflight and preview share it.
  - The check-up's example URL uses a sample order item id, because the slice gives none.

**Open question for the owner, before submitting the templates**

- **The approved button URLs** point at `https://mpillow.com/r/review?t=…` and
  `https://mpillow.com/appointments?…`.
- **This app's production origin is `custom.mpillow.com`** (`lib/site-url.ts`, and the
  preflight default). `mpillow.com` may still be the Shopify store until cutover.
- **Confirm that those two paths reach this app.** Changing a URL after approval needs a new
  template name.

**Left for ops or the owner**

1. Apply the migration.
2. Submit both templates:
   `npx tsx --env-file=.env.local scripts/whatsapp-create-templates.ts <WABA_ID> aftercare_review_request,aftercare_checkup`
   — _done: both approved as Utility (2026-10-21)._
3. Once Meta approves them, set `WHATSAPP_TEMPLATE_AFTERCARE_REVIEW=aftercare_review_request`
   and `WHATSAPP_TEMPLATE_AFTERCARE_CHECKUP=aftercare_checkup`.
4. Run `scripts/whatsapp-preflight.ts`, and record each template's category above. — _recorded;
   re-run once step 3 is done, to tick the box._
5. Prove the sender reaches a phone that is not on the test list (OPS-CHECKLIST §0.5).
6. Watch the support Reply-To inbox. Handle stop requests with the manual switch within 10
   business days.
7. Counsel confirms at sign-off (slice 09) that a Staff note is enough evidence for the check-up.
