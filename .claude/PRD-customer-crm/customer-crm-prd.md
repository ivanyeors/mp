# PRD — Customer CRM: notes, timeline, aftercare messages, reviews, segments, follow-ups

**Status:** specified, not started
**Audited:** 2026-10-20 against `main` @ `48c643f`: every code reference re-checked after the paired-build and WhatsApp merges (#258–#262), plus research on Meta's template rules, Singapore's Spam Control Act and PDPA, and Google's review policy.
**ADR:** `docs/adr/0027-customer-crm.md` (to be written by slice 01)
**Builds on:** `PRD-shopify-customer-migration`, slice 12 (`admin_customer_overview`) and its
*Toward a simple CRM* section, which this PRD replaces as the source of truth.
**Hands off to:** `PRD-email-marketing` (placeholder) for anything promotional.
**Owner decisions:** none open. See [Owner decisions](#owner-decisions).

## Problem statement

Staff can look a **Customer** up, but cannot keep a relationship with them.

- **No memory.** There is one free-text Notes box per Customer. It has no author or date, and
  the Customer can read it (audit §1).
- **No history.** The detail page shows orders, addresses and totals. It shows none of the
  Customer's **Results**, **Re-adjustment bookings**, returns, reviews or the emails we sent
  them (audit §2).
- **No ask at the right moment, and no record of who reviewed us.** Google reviews are where
  most prospects meet Mpillow (`PRD-google-review-replies`), yet nothing asks a customer for one
  after their order arrives. No Customer record says whether they have reviewed us, on Google
  or on the shop (audit §4).
- **No lists to work from and no follow-through.** Staff can search by name or email, but
  cannot keep a list such as *"Premium, bought over a year ago, never re-adjusted"*, and cannot
  note *"call back Friday"* for a colleague (audit §3, §5).

The goal is a simple CRM inside the Admin Panel. It covers who the customer is, everything
that has happened with them, what we said, and what to do next. It is built from facts the
platform already records, not from a second copy of them.

## What the audit found

### 1. Staff notes, tags and order notes are readable by the customer

- **Notes and tags on the Customer.** The Customer's own-row policy covers the whole row:
  `for select to authenticated using (auth_user_id = auth.uid())`
  (`supabase/migrations/0037_customer_auth.sql:14-18`). No later migration narrows it, and
  nothing grants or revokes columns on `customers`.
  - So a signed-in customer can read `customers.notes` and `customers.tags` with their own key,
    straight from the database API.
  - The storefront never shows these fields, so nobody has noticed.
  - Staff write them from the Notes and Tags cards
    (`app/[lang]/settings/customers/[id]/customer-detail-client.tsx:726-788`).
- **Order notes.** `orders.internal_notes` (`0028_ecommerce.sql:403`) is readable the same
  way. The customer order reads run under the shopper's RLS and select `*` from `orders`
  (`lib/shop/customer-orders.ts:16-28`).
- **The fix has a precedent.** `order_items` hides its cost columns by revoking the table grant
  and re-granting columns one by one. A column-level REVOKE does nothing while a table grant
  exists (`20260915170000_hide_variant_cost_price.sql:14-16,41-46`). Every column added after
  that must be granted explicitly (`20261013110000_order_items_kind.sql:23-26`).
- **The only storefront read of `customers` under the shopper's own key** selects `id` alone
  (`lib/shop/customer-addresses.ts:31-41`). Every other read uses the service role. A column
  grant therefore breaks nothing in the storefront.
- **`orders` is different.** The shopper's order query selects `*`, so it must switch to an
  explicit column list in the same change, as `order_items` already did (`customer-orders.ts:14-17`).
- **Saving notes or tags fails silently.** The PATCH route requires `first_name` / `last_name`
  to have at least one character (`app/api/shop/customers/[id]/route.ts:11-12`). The client
  always sends both, even when they are empty, and never checks the response
  (`customer-detail-client.tsx:244-255`). So saving a note on a Customer with no name returns
  a 400, and nothing tells the operator.
- **No audit trail.** Neither the route nor the unused server action
  (`app/[lang]/settings/customers/actions.ts`) writes `admin_audit_log`.

### 2. The history exists, spread across tables, and the detail page shows a fraction of it

| Source | Link to the Customer | When it happened | Today on the detail page |
|---|---|---|---|
| `orders` (`0028:384`) | `customer_id` | `created_at`, `paid_at`, `shipped_at`, `delivered_at`, `cancelled_at`, `refund_requested_at` | list only (needs `orders`) |
| `order_emails` (`0035_order_emails.sql:10`) | via `order_id` | `created_at`, status | no |
| `mp_config_responses`, the **Results** (`0023:6`) | `customer_id` **or** `customer_email`, with no FK (`0045_result_customer_access.sql:4-5`) | `created_at`, `assigned_at`, `topup_paid_at` only. A status change has no time of its own (`updated_at` moves on every reminder write); acceptance is dated by its **Order** | no |
| `readjustment_bookings` (`20261013120000:10`) | `customer_id` (NOT NULL) | `start_at`, `created_at`, status | no |
| `rma_requests` and `rma_status_events` (`20260723120000:23,54`) | `customer_id` | `created_at`, each status change | no |
| `product_reviews` (`0028:498`) | `customer_id` | `created_at`, status | no |

Planned in the migration PRD:

- slice 02: import (`migrated_customers`);
- slice 12: account linked;
- slice 05: claim;
- slice 07: consent events;
- slice 08: campaign sends.

Ruled out:

- customisation appointments: their `appointment_reminders` rows carry a phone and a name, but no
  Customer link (`20260709120000:2`). A re-adjustment's reminder does reach its Customer, through
  `readjustment_bookings.calendar_event_id`, and that booking is already a source;
- journey analytics (ADR 0007's consent boundary);
- `shopify_orders`, which has no customer fields.

**Results are matched the way the storefront matches them** (`lib/results/access.ts:30-36`):
`customer_id` equal, **or** the lower-cased emails equal, even when `customer_id` is set. A
timeline that joins only on `customer_id` would miss guest Results. A paired build is two
Results with the same customer and email (`paired_build_id`, `20261020004221`), and the
timeline shows them as one entry.

**Each source sits behind its own permission.** The keys are `orders`, `results`, `returns`
and `appointments` (`lib/auth/permissions.ts:39,49-52`). The detail page already needs
`orders` for its order list (`app/api/shop/orders/route.ts:65`).

### 3. The Customers list has search and nothing else

- **Filters.** `listAdminCustomers` takes `search`, comma-separated `tags`, `page`, `limit`
  and four sort orders (`lib/ecommerce/admin/customers.ts:24-70`).
- **The client** sends only search and page, keeps no filter in the URL, and has no tag or sort
  controls (`customers-client.tsx:77-108`).
- **Nowhere in the Admin Panel saves a named filter.** `site_settings` is the wrong home for
  one, because anyone can read it (`20260308000000_create_site_settings.sql:2-11`).
- **Search is interpolated into a PostgREST `.or()` without escaping**
  (`lib/ecommerce/admin/customers.ts:40`).
  - A search for `Tan, Mei` builds a malformed filter, which returns a 500.
  - Crafted input can add conditions of its own.
  - It is limited to Staff, so it is a correctness bug, not an escalation. It is still a pattern
    that CRM filters must not copy.
  - The same pattern appears in `orders-list.ts:78`, `lib/ecommerce/customers.ts:55`,
    `orders.ts:33` and `products.ts:90`.

### 4. Reviews exist in two places, and only one is tied to a Customer

- **Shop reviews.** `product_reviews` carries `customer_id` and `order_id`
  (`0028_ecommerce.sql:498-507`), and is moderated through Telegram.
- **Google reviews.**
  - `google_reviews` is filled by the Business Profile sync, by Pub/Sub plus a daily catch-up
    (`lib/reviews/google-sync.ts`; `20261002060000_google_review_replies.sql:40`). It covers one
    location, `GOOGLE_BUSINESS_LOCATION`.
  - A Google review carries only the reviewer's display name, a photo and an anonymous flag,
    never an email (`lib/google/business-profile.ts:28`). So it can be matched to a Customer
    only by name and timing, with a person confirming.
  - The sync needs Google's approval of API access, which may still be pending, plus the
    refresh token and location (`.claude/PRD-google-review-replies/OPS-CHECKLIST.md`, steps
    1–4). Pub/Sub (step 6) only makes it real-time.
- **Nothing in the code links to Google's review form.** No "write a review" URL exists
  anywhere.
- **The staffed support number** lives in `lib/contact.ts` (`SUPPORT_WHATSAPP_URL`,
  `SUPPORT_WHATSAPP_DISPLAY`). The review-reply drafts already send unhappy reviewers to it.
- **Google's review policy** forbids selectively asking for positive reviews, discouraging
  negative ones, and offering incentives. Any request must go to every eligible customer
  alike.
- **Delivery is not always recorded.** `delivered_at` is written by the Easyship "Delivered"
  event, by a manual status change, and at an in-store handover (`lib/ecommerce/fulfilment.ts:75-98`;
  `app/api/results/[id]/accept/route.ts:487-489`). It stays null when Easyship webhooks are not
  configured, or when Staff ship without marking the order delivered. Any email timed from
  delivery depends on it.
- **Booking needs Sign in.** `/appointments?type=readjustment&item=…` already sends a
  signed-out visitor to sign in and back (`app/[lang]/appointments/page.tsx:49-56`). The
  check-up reminder links there.

### 5. Scheduling, Staff identity, and how Staff hear about things

- **Two daily crons, no more.** Vercel Hobby allows two daily crons with about an hour of
  jitter. `vercel.json` already uses both: `/api/cron/appointment-reminders` (09:00 SGT) and
  `/api/cron/results-sla`. A test asserts there are exactly two
  (`lib/shopify/order-mirror-catchup.check.ts:24`).
  - New jobs chain onto `results-sla`, which already runs six other jobs
    (`app/api/cron/results-sla/route.ts:455-515`; ADR 0006).
- **Staff profiles.** A **Staff profile** (`mp_staff`) has a name and its **Member**, and no
  email or phone (`20261004110000_staff_profiles.sql:19-21`).
  - "Working as" is attribution only, never authorisation (`lib/staff/working-as.ts:9`).
  - Few rows point at a profile today: `mp_config_responses.measured_by_staff_id`
    (`0025_staff_management.sql:40-57`), `telegram_operators.staff_profile_id`
    (`20261004130000:25`) and `admin_audit_log.actor_profile_id` (`20261004140000:10`).
- **Telegram.** Notices go to one shared group chat (`lib/telegram/notify.ts:11,38-53`). There
  are no direct messages to a profile.
- **The Admin Panel has no inbox.** The one live signal is the sidebar Results badge
  (`components/settings/settings-sidebar-nav.tsx:259-270`).

### 6. What "linked up" can mean for an email and a mobile

- **Email.** An account binds by *verified* email (`linkCustomerToAuthUser`), so *has an
  account* means *email verified*. Without an account, the email was typed at checkout or
  imported, and is not verified.
- **Sign-in methods.** Sign-in is by emailed code or by Google (`components/auth/login-form.tsx`).
  Whether Google is linked is visible only on the signed-in user's `identities`
  (`app/[lang]/account/page.tsx:38`), and nothing stores it for Staff.
- **Mobile.** There is no mobile sign-in, so no number is ever verified by sign-in.
  - `customers.phone` is written at checkout (`findOrCreateCustomer`,
    `app/api/shop/checkout/route.ts:652`). The Profile only shows it
    (`app/[lang]/account/page.tsx:37,59-61`); the addresses page edits `customer_addresses.phone`.
    Bookings and Results carry their own phone snapshots.
  - Since 2026-10-20 every WhatsApp message a person sends to the utility sender is recorded in
    `whatsapp_inbound` (phone, kind, outcome, `received_at`; never the text;
    `20261020024120`). That is the proof a number reaches a person on WhatsApp. It is keyed by
    phone, with no Customer link; `phonesMatch` (`lib/appointments/contacts.ts:55`) matches it.
  - A send that failed leaves `appointment_reminders.last_error` (`20261019152211`), a sign that
    a number does not reach anyone.

### 7. One key covers seeing and changing Customers

`customers` guards every read and every write on the Customers page
(`lib/auth/permissions.ts:49`). The writes today are `POST /api/shop/customers`,
`PATCH /api/shop/customers/[id]` and `POST …/addresses`. A role cannot be given read-only
access. Roles store closed key sets, with `requires` applied on save
(`lib/auth/permission-matrix.ts:3,19`), so a new key needs a data migration to reach existing
roles.

## Solution

> **Put a CRM inside Admin Panel → Customers that reads the platform's own facts at view time:**
>
> - staff-only notes;
> - one timeline merged from the tables that already hold the history;
> - saved Segments over the Customer overview;
> - follow-ups assigned to Staff profiles;
> - one review request after delivery, and a yearly re-adjustment check-up;
> - reviews tied to each Customer: shop reviews exactly, Google reviews by Staff-confirmed
>   match.
>
> **Anything promotional is email marketing's, later.**

### What Staff see

- **Customers list.** The migration plan's filters plus CRM filters, a row of saved
  **Segments**, and a *Follow-ups* tab that shows *mine*, *all* and *overdue*.
- **Customer detail.** The Profile card and a **Contact and sign-in** card (slice 11), then:
  - **Notes**, newest first, each with its author and date;
  - **Follow-ups**, open first, each with its assignee and due date;
  - **Timeline**: everything that happened, newest first, filterable by kind.

## Decisions (ADR 0027 records these)

1. **Staff notes live in `customer_notes`, which only the service role can read.**
   - `customers.notes` stops being written, and its text moves into a first note.
   - `customers.tags` and `orders.internal_notes` are hidden from the customer by column
     grants, following the `order_items` precedent.
2. **The timeline is merged when it is read, never copied.**
   - One adapter per source table, and a pure merge.
   - Each kind shows only to Staff who hold that source's permission.
   - A new source means a new adapter, with no backfill.
3. **Segments are saved filter sets in their own table.**
   - They are validated by the same schema as the list's URL parameters, so a segment and a
     shared link can never disagree.
   - They are never stored in `site_settings`, which anyone can read.
4. **Filters never interpolate typed text into a PostgREST `.or()`.**
5. **Follow-ups are assigned to a Staff profile, not to a login.** Any notice outside the Admin
   Panel (Telegram) carries counts and a link, never customer names or details.
6. **An Aftercare message is a service message about something the customer bought.** There
   are two: the review request and the check-up reminder.
   - They go by email and WhatsApp, each channel with its own switch.
   - They use claim-before-send ledgers.
   - The review request never depends on marketing consent.
   - They never carry a discount or another product. Anything promotional belongs to
     `PRD-email-marketing`.
   - The check-up always states that the visit is paid, and its fee from Costings.
   - **The check-up needs consent** (research, 2026-10-20). Offering a paid visit is direct
     marketing under the PDPA, and Meta classes it as Marketing. Its email goes only to
     Customers with Marketing consent `subscribed`, and its WhatsApp only to those whose
     opt-in wording names it. The owner may relax the email rule if counsel advises (slice 08).
7. **The review request goes to every eligible customer alike** (Google's policy).
   - It is once per Customer and never selected by satisfaction.
   - It offers no incentive.
   - Its "reach us" line is unconditional.
   - There is no email about the free re-adjustment window (owner, 2026-10-20).
8. **A Google review is linked to a Customer only by a Staff confirmation.** The code
   suggests a match from the name and the timing of the request; it never links on its own.
   Shop reviews are linked exactly, by `customer_id`.
9. **New jobs chain onto `results-sla`.** No third cron is added.
10. **Seeing and changing are separate permissions.**
   - `customers` lets Staff see the whole CRM, including every follow-up.
   - A new `customers-edit` key, which requires `customers`, lets them change anything.
   - A data migration gives `customers-edit` to every role that holds `customers` today, so
     nobody loses access.
   - A guard test keeps every write path on `customers-edit`.
11. **Contact status is derived, never typed.**
    - *Email verified* means the person has signed in with that email.
    - *Signs in with Google* comes from their sign-in identities, recorded at sign-in.
    - *Mobile replied on WhatsApp* comes from an **Appointment reminder** reply.
    - Staff never tick a "verified" box.
12. **Aftercare switches are per channel, and every change is recorded.**
    - Email is on unless switched off.
    - WhatsApp is off until the customer opts in (Meta's rule).
    - Only two things change them: the customer in their own Profile, once signed in, and
      Staff's manual switch, with a note (owner, 2026-10-20).
    - A WhatsApp *STOP* becomes an open request for Staff, and pauses WhatsApp until they act.
    - Every email also says *"or reply to this email and we'll do it for you"*, which is the
      unsubscribe address Singapore's Spam Control Act asks for.
    - Turning WhatsApp on stores the exact opt-in wording, as evidence of consent.
    - Each change writes who, how and when.
13. **Telegram updates are four types, each with its own switch** (owner, 2026-10-20): new
    online Result to review, Google reviews to match, new sign-ups, and a weekly summary.
    - The CRM's own types carry counts, Staff names and links only.
    - The online Result notice already exists, and keeps its content. Only its switch is new.
14. **The CRM's own tables follow the migration PRD's rules** (ADR 0028 k, l):
   - facts, not statuses;
   - staff-only data off `customers`;
   - append-only events, each keyed by `customer_id` with a timestamp.

## The parts

Parts 1–6 are the ones the owner approved on 2026-10-19. Parts 7–11 were added at the owner's
request on 2026-10-20, when part 3 also changed from a free re-adjustment reminder to a review
request, by email and WhatsApp.

### 1. Staff notes customers cannot read (slice 02)

This slice comes first, because it closes a live exposure and every other part leans on it.

- **Notes.** `customer_notes` holds the author's **Staff profile**, the time and the text.
  - A note can be deleted by its author or by an Owner or Admin. Deletion is soft and audited.
  - Notes are never edited: a correction is a new note.
- **The grants.** The column grants on `customers` and `orders` go in, and the shopper's order
  query moves to an explicit column list.
- **The save path.** Saving sends only the fields that changed, shows an error when the save
  fails, and writes the audit log.

### 2. One timeline (slice 03)

The timeline sits on the Customer detail. It draws from:

- orders, with their payment, shipping and delivery steps;
- the order emails that went out;
- Results, matched by id or by email;
- re-adjustment bookings and their outcomes;
- returns and each step a return went through;
- reviews;
- notes and follow-ups;
- once the migration slices land: imported, signed up, claimed, consent changes and campaign
  emails.

It shows the newest 50 entries, can load more, and filters by kind.

### 3. Aftercare messages (slices 07, 08), by email and WhatsApp

- **Slice 07: a review request.** 14 days after an order is delivered, the customer gets one
  message by email and, if they opted in, by WhatsApp.
  - The button opens our Google review link, `https://g.page/r/CfdGhvgB1hwUEBM/review` (owner,
    2026-10-20).
  - It thanks them, asks for a Google review with one button, and then has a short line:
    *"Need anything else — a re-adjustment, a spare cover, or help with your order? Message us
    on WhatsApp…"*.
  - It goes once per Customer, ever, and to everyone eligible alike.
  - The button goes through our own redirect, so we know who opened it.
  - This replaces the free re-adjustment reminder, which the owner dropped on 2026-10-20.
- **Slice 08: a yearly *"time for a re-adjustment"***, 12 months after delivery.
  - It is a **service message** (owner, 2026-10-20), under the same rules: no offer, the same
    switches, once per milestone per Order.
  - **It says the visit is paid**, with the fee read from Costings at send time (S$30 today).
    If the fee cannot be read, it is not sent.
  - It covers **Premium Mpillow only** (owner, 2026-10-20).
  - It goes only to customers who agreed: email needs Marketing consent, and WhatsApp needs an
    opt-in that names it (research, 2026-10-20; slice 08).
- **Turning them off** (slice 13). The customer can do it in their Profile, once signed in.
  Staff can do it for anyone who asks, with a manual switch on the Customer page.

### 4. Saved segments (slices 04, 05)

- **Slice 04** adds the CRM's columns to the Customer overview, the filters that use them, and
  the search-escaping fix. The new columns are:
  - first and last order;
  - which products they bought (Premium, Basic, Mbolster, accessories);
  - last re-adjustment;
  - open follow-ups.
- **Slice 05** lets Staff save a filter set under a name and share it with every Staff member
  who holds `customers`. Each segment shows a live count.

### 5. Email marketing: a hand-off, not a build here

Sending marketing email is a separate initiative the owner will take on later:
[`PRD-email-marketing`](../PRD-email-marketing/email-marketing-prd.md). The CRM gives it three
things:

- **Audiences.** A **Segment** resolves to a set of Customers through one function in `lib/`,
  `resolveSegment`. Email marketing narrows that set by consent and suppression, and never
  re-implements the filters.
- **History.** Every campaign send is a timeline entry, through an adapter on
  `customer_campaign_sends` (migration slice 08).
- **A boundary.** Aftercare messages (part 3) stay in the CRM as service messages. Newsletters,
  offers and promotional flows belong to email marketing.

No CRM slice builds a Campaigns page, a composer, or a marketing send.

### 6. Follow-ups (slice 06)

- **What one is.** `customer_followups` holds a title, a due date, an assignee (a **Staff
  profile**) and who created it. Marking it done records who and when.
- **On the Customer detail** you add and complete them.
- **On the Customers page**, a *Follow-ups* tab lists them as *mine*, *all* and *overdue*.
  *Mine* means assigned to the profile you are working as.
- **Reminders.**
  - A sidebar badge counts what is due today and overdue for the current profile, following
    the Results badge.
  - Follow-ups post nothing to Telegram of their own (owner, 2026-10-20). The weekly summary
    counts them.
- **Who sees what.** Everyone who can see Customers sees every follow-up (owner, 2026-10-20).
  Creating, completing and reassigning need `customers-edit` (part 8).

### 7. Contact and sign-in status (slice 11)

Staff see whether a customer's email and mobile are "linked up":

- **Email:** verified (they have signed in with it, and since when) or not, and where it came
  from (checkout, or the Shopify import).
- **Signs in with:** emailed code, Google, or both.
- **Mobile:** whether a number is on file, whether it is a valid Singapore mobile, whether it
  has ever replied to a WhatsApp appointment reminder, and any other numbers seen on their
  bookings and Results.
- **Aftercare:** the email and WhatsApp switches, with their last change, plus marketing
  consent (once migration slice 07 lands) and bounces (once migration slice 08 records them).

The list gains matching filters, such as *email not verified* or *mobile missing*. Every status
comes from a fact, never from a box Staff tick.

### 8. View-only access (slice 10)

A role can be given the CRM to **see** without being able to **change** it:

- `customers` covers seeing everything, including every follow-up;
- the new `customers-edit` covers every change.

Existing roles keep editing, because a data migration grants them `customers-edit`. Making a
role view-only is one untick on Users & permissions → Roles.

### 9. Reviews on every Customer (slice 12)

The owner added this on 2026-10-20.

- **The list.** A *Review* column shows the strongest fact first: *★5 Google*, *★4 shop (2)*,
  *Asked 3 Nov · clicked*, *Asked 3 Nov*, or *—*. Matching filters make a Segment such as
  *"reviewed us 5★ on Google"* one click.
- **Shop reviews** are tied exactly, by `customer_id`.
- **Google reviews** are tied by suggestion and confirmation, because Google never tells us
  who wrote a review.
  - The CRM suggests a Customer by name, preferring people we asked shortly before and who
    opened the link.
  - Staff confirm with *Link* or *Not them*, or link a review by hand.
  - The more review requests go out, the better the suggestions become.
- **The customer detail** gets a Reviews card: their Google review (stars, text, whether we
  replied), their shop reviews, and when we asked.
- **The Google side needs the Google review sync live.** Until then the column shows *Asked*
  and *Clicked* only.

### 10. Aftercare switches and WhatsApp (slice 13)

- **Two switches per Customer:** *Aftercare by email* (on by default) and *Aftercare by
  WhatsApp* (off until they opt in).
- **The manual switch.** Staff can flip either on the Customer page, for example when a
  customer asks on WhatsApp to stop. A note records why, and turning WhatsApp on requires a
  note saying how the customer agreed.
- **Customers change them themselves in their Profile, once signed in.** That is the only
  self-serve way (owner, 2026-10-20). The email footer links there.
- **A *STOP* reply on WhatsApp** is not dropped. It becomes an open request on the Customer
  page, pauses WhatsApp for that Customer, and gets a reply saying Staff will switch it off.
- **WhatsApp** sends through the existing utility sender. The WhatsApp Business account and
  its appointment templates are approved. The two aftercare templates are new: slice 13 drafts
  them, and adds them to `scripts/whatsapp-create-templates.ts` as **Marketing** templates. It
  follows the partner WhatsApp alerts: email always goes, and WhatsApp is added on top when
  allowed.
- **"Cancel" stays safe.** A bare *cancel* right after an aftercare message asks before it
  cancels an appointment.
- **Fewer WhatsApp recipients.** With no checkout checkbox, WhatsApp reaches only customers who
  turned it on in their Profile, or told Staff they agree. Most aftercare will go by email.

### 11. Telegram updates (slice 14)

Four update types, chosen by the owner on 2026-10-20. Each has its own switch on the Customers
page, plus *Send test*.

- **New online Result to review**, instant. This is today's *Held Result (online purchase) —
  review needed* notice, unchanged; it just gains a switch. Changing that switch also needs
  `results`.
- **Google reviews to match**, daily, only when there are any.
- **New sign-ups**, daily, only when there are any.
- **A weekly summary**, on a chosen day (Monday by default).

The three CRM types carry counts, Staff names and a link, never a customer's details. Follow-up
and aftercare updates are not built.

## User stories

**Staff**

1. As Staff, I write a note on a Customer, and the customer can never read it, whether in the
   storefront or through the database API.
2. As Staff, I see who wrote each note and when.
3. As Staff, I open a Customer and see everything that has happened with them, newest first,
   on one timeline.
4. As Staff without access to Orders, the timeline does not show me order entries.
5. As Staff, I filter Customers by what they bought, when they last ordered, whether they have
   re-adjusted, and how much they have spent.
6. As Staff, I save a filter as a Segment and my colleagues see it with a live count.
7. As Staff, I add a follow-up for myself or a colleague with a due date, and it appears in
   their *Follow-ups* list and badge.
8. As Staff, I see what is overdue, and I can mark a follow-up done.
9. As Staff, I search for a name with a comma or a bracket in it and get results, not an error.
10. As Staff, when saving a Customer fails, I am told.

**Customer**

11. As a customer, about two weeks after my order arrives, I get one email asking me to review
    Mpillow on Google, with a one-tap button.
12. As a customer, that email also tells me how to reach Mpillow if I need anything else.
13. As a customer, I am asked for a review once, not after every order, and I can turn off
    emails after a purchase in my Profile.

**Owner**

14. As the owner, I can switch review requests on or off, set how many days after delivery they
    go out, and set our Google review link.
15. As the owner, I see how many requests went out, how many were opened, and how many Google
    reviews we linked back to customers we asked.
16. As the owner, the CRM's segments are ready to become email-marketing audiences, with no
    rework.
17. As the owner, I can give a role view-only access to Customers: they see everything,
    including every follow-up, and can change nothing.
18. As Staff with view-only access, I am never assigned a follow-up I cannot close.
19. As Staff, I see whether a customer's email is verified, and whether they sign in by code or
    by Google.
20. As Staff, I see whether a customer's mobile is on file, valid, and has ever replied to us
    on WhatsApp.
21. As Staff, I see on each Customer whether they reviewed us on Google or on the shop, with the
    stars, and whether and when we asked them.
22. As Staff, I confirm or reject a suggested match between a Google review and a Customer, or
    link one by hand. Nothing is linked without me.
23. As Staff, I can filter and save Segments by review status, such as *reviewed 5★ on Google*.
24. As a Premium Mpillow owner, about a year after delivery, I get one check-up reminder that a
    re-adjustment would help, and it tells me plainly that it is a paid visit and what it costs.
25. As a customer who asks to stop the reminders, by email, on WhatsApp or in person, Staff
    switch them off for me, and I get none after that.
26. As a customer, I can turn aftercare messages off, or WhatsApp on, myself in my Profile once
    I sign in.
27. As a customer, I only get aftercare on WhatsApp if I said yes to it, in my Profile or by
    telling Staff.
28. As Staff, I see each Customer's aftercare switches with who changed them, how and when.
29. As the owner, I switch each Telegram update on or off: new online Results to review,
    Google reviews to match, new sign-ups, and the weekly summary.
30. As the owner, I can send a test of the updates I have switched on before relying on them.

## Non-goals

- **Marketing email of any kind**, which belongs to `PRD-email-marketing`. That includes
  newsletters, offers, campaigns and promotional automations.
- **WhatsApp or SMS marketing from the CRM.** Do Not Call duties apply. WhatsApp carries only
  Aftercare messages, and only to customers who opted in (slice 13). Nothing promotional goes
  by WhatsApp.
- **Linking Google reviews automatically.** A name is not an identity (decision 8).
- **Asking only happy customers for a review**, or rewarding a review. Both are against
  Google's policy (decision 7).
- **Mobile sign-in or phone verification by code.** Slice 11 shows what is known about a number;
  it does not add a way to verify one.
- **Exporting a segment as a CSV.** It is a bulk PII export, and would need its own permission
  and PRD.
- **Scoring, predictions, "churn risk", or AI summaries.**
- **Journey analytics on the timeline.** ADR 0007's consent boundary applies.
- **Customisation appointments on the timeline.** Their reminder rows carry a phone and a name,
  but no Customer link, and matching a booking to a Customer by phone alone is a guess.
- **Staff email notifications per profile.** A profile has no email address.
- **Merging two Customers.** Support handles it case by case, as in the migration PRD.
- **Editing the re-adjustment rule.** That belongs to ADR 0024 and Costings.

## Risks

| Risk | Reality | Mitigation |
|---|---|---|
| The column grant breaks a storefront read | Real: `orders` is read with `select *` under RLS | The same slice lists columns in `customer-orders.ts`. A check test reads every storefront path as a customer. |
| A new `customers` column is invisible to the customer once grants exist | Certain, by design | Every later migration that adds a customer-readable column must grant it. Migration slice 07's `marketing_email` is the first; whichever lands second adds the grant. |
| The timeline shows a Result to the wrong Customer through an email match | Possible: the storefront already grants access on a lower-cased email match | Match exactly as `lib/results/access.ts:30-36` does (id, or lower-cased email), so the timeline never shows a Customer a Result their own login could not open. A test pins the two together. |
| The timeline is slow on a long-standing Customer | Each source query is bounded | Each adapter loads at most `limit` rows before the cursor, and the merge takes the newest `limit` overall. |
| A review request goes out before the pillow arrives | Real if timed from payment | Timed from `delivered_at`, after a set number of days. Orders never marked delivered are counted on the Aftercare card, not emailed. |
| The review request counts as review gating | Real if the copy steers unhappy customers away, or if candidates are filtered by satisfaction | Everyone eligible is asked alike; the "reach us" line is unconditional; no incentive. A check asserts the candidate query never reads review or return data. The owner reads the copy against Google's policy. |
| A Google review is linked to the wrong Customer | Real: names collide | Suggestions only, never automatic. Staff confirm, can unlink, and rejected pairs are never suggested again. |
| An aftercare message is treated as spam | Low for one review request per Customer and one check-up per milestone | No offer, transactional transport, a switch per channel. Counsel reads the final copy once. |
| A WhatsApp message goes to someone who never agreed | Real if Staff switch it on casually | WhatsApp is off by default. Turning it on needs the customer's own action, or a Staff note recording that they agreed. Every change is an event. |
| Meta classes a template as Marketing | Expected for both (research, 2026-10-20) | Submitted as Marketing from the start, so nothing is recategorised later. It costs about S$0.09 a message instead of S$0.02, and goes to opted-in people only, which our opt-in covers. A person who turned off marketing in WhatsApp gets error `131050`; that is recorded and shown, and email still goes. |
| The check-up is direct marketing without consent | Real: the PDPA treats offering a paid visit as direct marketing, needing express consent | Email only to Marketing consent `subscribed`; WhatsApp only with an opt-in that names it, its wording stored (slices 08, 13). Counsel confirms at sign-off. |
| A customer types *cancel* to stop aftercare and cancels an appointment | Real: `CANCEL_WORDS` cancels the next appointment on that number | A bare *cancel* right after an aftercare message asks first (slice 13). |
| A STOP reply is missed | Real: today a STOP gets the generic auto-reply, which says the number only sends *appointment* messages, and nothing records it as a request (`app/api/webhooks/whatsapp/route.ts`) | A *STOP* becomes an open request on the Customer page, pauses WhatsApp for that Customer, and gets its own reply (slice 13). |
| The check-up template's price goes stale | Real if the approved template has the price written into it | WhatsApp goes only while Costings' fee matches the price recorded for the template; otherwise email only, and the Aftercare card says why (slice 13). |
| A mail scanner "clicks" the review link | Common with Outlook Safe Links | A click is a hint that strengthens a match, never proof of a review. |
| Telegram leaks customer data to a group | Certain if names are posted | The CRM's types carry counts, Staff names and a link only (decisions 5 and 13). A test scans their output for fixture customer names and emails (slice 14). The online Result notice keeps today's content, which this PRD does not change. |
| The Hobby cron runs late (about ±1 hour) | Known | Reminders and digests are day-granular. |

## Success criteria

- A signed-in customer's own key cannot read `customers.notes`, `customers.tags`,
  `orders.internal_notes` or any `customer_notes` row. This is proven by a check that calls the
  database API as a customer.
- Every account and order page still works for a customer after the grants.
- The timeline for a test Customer lists every fixture event across all sources, in order, and
  hides each kind from a role without that kind's key.
- A saved Segment and the same filters in the URL return identical Customers.
- Each eligible Customer gets exactly one review request. Nobody who opted out, or whose order
  was never marked delivered, gets one.
- After the first month, the owner sees requests sent, links opened, and Google reviews linked
  to asked Customers.
- No Google review is ever linked to a Customer without a Staff action.
- A view-only role gets a 403 from every write path, and the guard test fails on any write path
  left on `customers`.

## Owner decisions

None are open. One rule was tightened by research, and the owner can relax it after counsel:

- **The check-up email needs Marketing consent** (slice 08). If counsel advises that a Premium
  Mpillow buyer may be reminded without it, drop that condition.

HITL, not decisions:

- the owner approves the email copy and the two WhatsApp templates' copy (slice 13);
- someone runs `scripts/whatsapp-create-templates.ts` for the two templates, then preflight;
- counsel reads the final copy and the opt-in wording once (slice 09).

**Decided** (owner, 2026-10-20):

- The periodic check-up is a **service message** (slice 08).
- Every Staff member who can see Customers sees every follow-up, and there is a view-only
  permission (slice 10).
- The CRM shows whether a customer's mobile and email are linked up (slice 11).
- **No email about the free re-adjustment window.** Instead, a Google review request after
  delivery, with a short "reach us if you need anything else" line (slice 07).
- **Each Customer shows their reviews** (slice 12).
- **The review request goes 14 days after delivery,** to `https://g.page/r/CfdGhvgB1hwUEBM/review`.
- **The yearly check-up says it is a paid visit,** with the fee from Costings.
- **Both email and WhatsApp,** with a manual switch for Staff to turn a customer's reminders
  off (slice 13).
- **The Telegram updates are in scope** (slice 14).
- **Customers change aftercare only in their Profile, once signed in** (slice 13). There is no
  email unsubscribe link, no WhatsApp keyword, and no checkout checkbox.
- **Meta approval is done** for the WhatsApp Business account and its appointment templates.
  The two aftercare templates are new, and slice 13 submits them.
- **Four Telegram types:** new online Result to review, Google reviews to match, new sign-ups,
  and a weekly summary (slice 14).
- **The yearly check-up covers Premium Mpillow only** (slice 08).
