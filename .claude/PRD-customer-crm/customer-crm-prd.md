# PRD — Customer CRM: notes, timeline, care reminders, segments, follow-ups

**Status:** specified, not started
**ADR:** `docs/adr/0027-customer-crm.md` (to be written by slice 01)
**Builds on:** `PRD-shopify-customer-migration`, slice 12 (`admin_customer_overview`) and its
*Toward a simple CRM* section, which this PRD replaces as the source of truth.
**Hands off to:** `PRD-email-marketing` (placeholder) for anything promotional.
**Owner decisions still open:** see [Open decisions](#open-decisions-for-the-owner).

## Problem statement

Staff can look a **Customer** up, but cannot keep a relationship with them.

- **No memory.** There is one free-text Notes box per Customer. It has no author or date, and
  the Customer can read it (audit §1).
- **No history.** The detail page shows orders, addresses and totals. It shows none of the
  Customer's **Results**, **Re-adjustment bookings**, returns, reviews or the emails we sent
  them (audit §2).
- **No reason to get in touch at the right moment.** A Premium Mpillow comes with a free
  re-adjustment that expires 60 days after purchase, and nothing tells the customer before it
  lapses (audit §4).
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
| `mp_config_responses`, the **Results** (`0023:6`) | `customer_id` **or** `customer_email`, with no FK (`0045_result_customer_access.sql:4-5`) | `created_at`, status changes | no |
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

- customisation appointments, which live only in Google Calendar;
- `appointment_reminders`, which has no customer link (`20260709120000:2`);
- journey analytics (ADR 0007's consent boundary);
- `shopify_orders`, which has no customer fields.

**Results are matched the way the storefront matches them.** That means `customer_id`, or the
email when no id is set (`lib/results/access.ts:9-37`). A timeline that joins only on
`customer_id` would miss guest Results.

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

### 4. The free re-adjustment is the natural moment to get in touch

- **The rule.** Premium Mpillow only. Each unit gets `readjustment_free_visits` free visits
  (default 1), within `readjustment_free_window_days` (default 60) of `orders.paid_at`, counted
  in Singapore calendar days (`docs/adr/0024-services-priced-in-costings.md:31-35`;
  `lib/readjustment/eligibility.ts:69-97`).
  - `evaluateReadjustment` is the single implementation of this rule.
  - A visit counts as used once it is `booked`, `attended` or `no_show`
    (`lib/readjustment/purchases.ts:33`).
- **Build and shipping eat into the window**, because it runs from payment, not delivery. The
  re-adjustment PRD accepts this (`service-fees-readjustment-prd.md:357`).
- **Delivery is not always recorded.** `delivered_at` is written by the Easyship "Delivered"
  event, by a manual status change, and at an in-store handover (`lib/ecommerce/fulfilment.ts:75-98`;
  `app/api/results/[id]/accept/route.ts:334-337`). It stays null when Easyship webhooks are not
  configured, or when Staff ship without marking the order delivered.
- **Booking needs Sign in.** `/appointments?type=readjustment&item=…` already sends a
  signed-out visitor to sign in and back (`app/[lang]/appointments/page.tsx:49-56`).

### 5. Scheduling, Staff identity, and how Staff hear about things

- **Two daily crons, no more.** Vercel Hobby allows two daily crons with about an hour of
  jitter. `vercel.json` already uses both: `/api/cron/appointment-reminders` (09:00 SGT) and
  `/api/cron/results-sla`. A test asserts there are exactly two
  (`lib/shopify/order-mirror-catchup.check.ts:24`).
  - New jobs chain onto `results-sla`, which already runs six other jobs
    (`app/api/cron/results-sla/route.ts:404-464`; ADR 0006).
- **Staff profiles.** A **Staff profile** (`mp_staff`) has a name and its **Member**, and no
  email or phone (`20261004110000_staff_profiles.sql:19-21`).
  - "Working as" is attribution only, never authorisation (`lib/staff/working-as.ts:9`).
  - The only business row that points at a profile today is
    `mp_config_responses.measured_by_staff_id` (`0025_staff_management.sql:40-57`).
- **Telegram.** Notices go to one shared group chat (`lib/telegram/notify.ts:11,38-53`). There
  are no direct messages to a profile.
- **The Admin Panel has no inbox.** The one live signal is the sidebar Results badge
  (`components/settings/settings-sidebar-nav.tsx:259-270`).

## Solution

> **Put a CRM inside Admin Panel → Customers that reads the platform's own facts at view time:**
>
> - staff-only notes;
> - one timeline merged from the tables that already hold the history;
> - saved Segments over the Customer overview;
> - follow-ups assigned to Staff profiles;
> - a care reminder before a free re-adjustment lapses.
>
> **Anything promotional is email marketing's, later.**

### What Staff see

- **Customers list.** The migration plan's filters plus CRM filters, a row of saved
  **Segments**, and a *Follow-ups* tab that shows *mine*, *all* and *overdue*.
- **Customer detail.** Profile and Account cards (migration slice 12), then:
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
6. **A care reminder is a service message about something the customer bought.**
   - It uses the transactional transport and the `order_emails` ledger.
   - It has its own opt-out, so it never depends on marketing consent.
   - It never carries an offer. Anything promotional belongs to `PRD-email-marketing`.
7. **The re-adjustment rule has one implementation.** Reminders call `evaluateReadjustment`.
   They never restate the 60 days or the Premium-only rule.
8. **New jobs chain onto `results-sla`.** No third cron is added.
9. **The CRM's own tables follow the migration PRD's rules** (ADR 0026 k, l):
   - facts, not statuses;
   - staff-only data off `customers`;
   - append-only events, each keyed by `customer_id` with a timestamp.

## The six parts

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

### 3. Care reminders (slices 07, 08)

- **Slice 07: *"Your free re-adjustment is available until {date}."***
  - It goes to Premium Mpillow buyers who have not used their free visit, a set number of days
    before the window closes.
  - It is sent only once the order is marked delivered, and only to customers who have not
    switched care reminders off.
  - The link opens re-adjustment booking.
- **Slice 08: a periodic *"time for a re-adjustment"*** some months after delivery. This one is
  gated: if counsel says it is marketing, it moves to `PRD-email-marketing` as an automated
  flow and this slice is closed.

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
- **A boundary.** Care reminders (part 3) stay in the CRM as service messages. Newsletters,
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
  - A morning digest goes to the Staff Telegram group, chained onto `results-sla`. It carries
    counts per Staff profile and a link, and no customer details.

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

11. As a Premium Mpillow owner, I get one email before my free re-adjustment lapses, which takes
    me straight to booking.
12. As a customer, I can switch care reminders off in my Profile, and I get none after that.
13. As a customer who has already booked my free visit, I am not reminded.

**Owner**

14. As the owner, I can turn care reminders on or off, and set how many days before the window
    closes they go out.
15. As the owner, I see how many care reminders went out, and how many led to a booking.
16. As the owner, the CRM's segments are ready to become email-marketing audiences, with no
    rework.

## Non-goals

- **Marketing email of any kind**, which belongs to `PRD-email-marketing`. That includes
  newsletters, offers, campaigns and promotional automations.
- **WhatsApp or SMS outreach from the CRM.** Do Not Call duties apply, and the WhatsApp channel
  is for **Appointment reminders**.
- **Exporting a segment as a CSV.** It is a bulk PII export, and would need its own permission
  and PRD.
- **Scoring, predictions, "churn risk", or AI summaries.**
- **Journey analytics on the timeline.** ADR 0007's consent boundary applies.
- **Customisation appointments on the timeline.** They live only in Google Calendar, with no
  customer link.
- **Staff email notifications per profile.** A profile has no email address.
- **Merging two Customers.** Support handles it case by case, as in the migration PRD.
- **Editing the re-adjustment rule.** That belongs to ADR 0024 and Costings.

## Risks

| Risk | Reality | Mitigation |
|---|---|---|
| The column grant breaks a storefront read | Real: `orders` is read with `select *` under RLS | The same slice lists columns in `customer-orders.ts`. A check test reads every storefront path as a customer. |
| A new `customers` column is invisible to the customer once grants exist | Certain, by design | Every later migration that adds a customer-readable column must grant it. Migration slice 07's `marketing_email` is the first; whichever lands second adds the grant. |
| The timeline shows a Result to the wrong Customer through an email match | Possible if the emails differ only in case or whitespace | Match exactly as `lib/results/access.ts` does, with a test covering case and whitespace. |
| The timeline is slow on a long-standing Customer | Each source query is bounded | Each adapter loads at most `limit` rows before the cursor, and the merge takes the newest `limit` overall. |
| A care reminder goes out for a pillow not yet received | Real: the window runs from payment | Send only once `delivered_at` is set, and only after a settling period. Orders never marked delivered are counted on the admin card, not emailed. |
| A care reminder is treated as spam | Low for a single service message about a benefit already bought | One email per order, no offer, transactional transport, its own opt-out. The periodic reminder waits for counsel (owner decision 2). |
| Telegram leaks customer data to a group | Certain if names are posted | Counts and a link only (decision 5). |
| The Hobby cron runs late (about ±1 hour) | Known | Reminders and digests are day-granular. |

## Success criteria

- A signed-in customer's own key cannot read `customers.notes`, `customers.tags`,
  `orders.internal_notes` or any `customer_notes` row. This is proven by a check that calls the
  database API as a customer.
- Every account and order page still works for a customer after the grants.
- The timeline for a test Customer lists every fixture event across all sources, in order, and
  hides each kind from a role without that kind's key.
- A saved Segment and the same filters in the URL return identical Customers.
- Each eligible order gets exactly one care reminder. Nobody who has booked, opted out, or not
  had the order marked delivered gets one.
- The owner sees the care reminders' booking rate after the first month.

## Open decisions for the owner

1. **Care reminder timing:** how many days before the free window closes (default 14), and the
   settling period after delivery (default 3 days).
2. **The periodic check-up reminder (slice 08):** is it a service message or marketing? This
   needs counsel. Also decide its timing (default 12 months after delivery) and which pillows
   it covers.
3. **Follow-up visibility:** can every Staff member with `customers` see every follow-up
   (default yes), or only their own and ones they created?
4. **The Telegram digest:** on or off (default on, counts only).
