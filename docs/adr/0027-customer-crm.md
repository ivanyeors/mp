# The Customer CRM reads the facts the platform already records, and sends no marketing

Status: Accepted (PRD `customer-crm`, owner decisions 2026-10-19 and 2026-10-20)

Staff can look a **Customer** up in the **Admin Panel**, but cannot keep a relationship with them:
there is one free-text Notes box the customer can read, no history beyond the order list, no
review ask, no saved lists and no follow-through. This record decides what the CRM inside Admin
Panel → Customers is made of: **Customer notes**, one **Customer timeline**, saved **Segments**,
**Follow-ups**, two **Aftercare messages**, **Linked Google reviews** and a derived **Contact
status**. It builds on the Customer overview (`admin_customer_overview`) and the *facts, not
statuses* rule of [ADR 0028 — Shopify customer migration](0028-shopify-customer-migration.md)
(its decisions k and l), and the CRM's own tables follow them: events and timestamps, not stored
statuses; staff-only data off `customers`; append-only events keyed by `customer_id`.

## Context

"CRM" invites two wrong designs, and these decisions close both doors:

- **A second copy of the history.** An events table fed by triggers drifts from the tables it
  copies. The history already exists: `orders`, `order_emails`, the **Results**
  (`mp_config_responses`), `readjustment_bookings`, `rma_requests` / `rma_status_events` and
  `product_reviews` each record their own part, and each sits behind its own **Permission**
  (`orders`, `results`, `appointments`, `returns`).
- **A marketing tool.** That is `PRD-email-marketing`'s job.

Four facts about today's code shape the rest:

- **Staff notes are readable by the customer.** The own-row policy on `customers` covers the
  whole row (`0037_customer_auth.sql:14-18`), so a signed-in customer can read `customers.notes`
  and `customers.tags` with their own key, and `orders.internal_notes` the same way. A policy is
  row-level: only column grants can hide a column, and a column-level REVOKE does nothing while a
  table grant exists (`20260915170000_hide_variant_cost_price.sql:14-16`).
- **One key covers seeing and changing.** `customers` guards every read and every write on the
  Customers page (`lib/auth/permissions.ts:49`), so a role cannot be given read-only access.
- **Vercel Hobby allows two daily crons, and both are used.** A check asserts there are exactly
  two (`lib/shopify/order-mirror-catchup.check.ts:24`).
- **Google never says who wrote a review**, only a display name. Its review policy forbids asking
  selectively, discouraging negative reviews, and incentives. The PDPA treats offering a paid
  visit as direct marketing, and Meta requires a WhatsApp opt-in from the customer.

## Decisions

- **(a) Staff-only notes live in `customer_notes`.** `customers.notes` stops being written and
  its text is moved there. Column grants hide `customers.notes`, `customers.tags` and
  `orders.internal_notes` from the authenticated role. This follows the `order_items` precedent
  (`20260915170000_hide_variant_cost_price.sql`).
- **(b) The timeline is merged when it is read.** One adapter per source, and a pure merge.
  Each kind is shown only with its source's permission.
- **(c) Segments live in their own table.** They are validated by the list's URL schema, and
  never stored in `site_settings`, which anyone can read.
- **(d) No typed text goes into a PostgREST `.or()` filter.**
- **(e) Follow-ups are assigned to Staff profiles.** A notice outside the Admin Panel carries
  counts and a link only.
- **(f) An Aftercare message is a service message.** It uses the transactional email
  transport and the utility WhatsApp sender, claim-before-send ledgers
  (`customer_review_requests`, `customer_emails`, `customer_whatsapp`), per-channel switches, and
  no discount or other product. A failed email is retried; `order_emails`' final-failure rule
  is not copied. The Review request goes to every eligible Customer alike, once, with no
  incentive (Google's policy). There is no free-window reminder (owner, 2026-10-20).
- **(g) No third cron.** CRM jobs chain onto `results-sla`
  ([ADR 0006](0006-analytics-db-channel-facts.md)'s precedent).
- **(h) The CRM sends no marketing.** It hands Segments and timeline history to
  `PRD-email-marketing`. The yearly check-up is built here (owner, 2026-10-20) under (f)'s
  rules, but it offers a paid visit, which the PDPA treats as direct marketing. So it goes only
  to customers who agreed: Marketing consent for email, and an opt-in that names it for
  WhatsApp. Both WhatsApp templates are submitted as Utility (owner, 2026-10-20); Meta has the
  final say on category, and nothing depends on it.
- **(i) Seeing and changing are separate keys.** `customers` means seeing the Customers page;
  `customers-edit` (which requires `customers`) covers every change. Existing roles are
  migrated to hold both, and a guard test keeps writes on `customers-edit`.
- **(j) Contact status is derived.** It comes from sign-in, sign-in identities and
  `whatsapp_inbound`, never from a Staff-set flag.
- **(k) A Google review is linked to a Customer only by Staff confirmation.** The code
  suggests, and a person decides. Review data never selects who receives a Review request.
- **(l) Aftercare preferences are per channel, and every change is an event.** Email
  defaults on and WhatsApp defaults off (Meta's opt-in rule, following the partners'
  `notify_whatsapp`). Two sources can change them: the customer's own Profile, once signed in,
  and Staff's manual switch with a note (owner, 2026-10-20). A WhatsApp *STOP* becomes an open
  request for Staff, and pauses WhatsApp until they act. One SQL function writes the column and
  the event together. Turning WhatsApp on stores the opt-in wording shown, as evidence.
- **(m) Telegram updates are four switchable types** (owner, 2026-10-20): new online Result to
  review, Google reviews to match, new sign-ups, and a weekly summary. The CRM's own types
  carry counts, Staff names and links only. The online Result notice already exists, and keeps
  its content. Scheduled types go at most once per period, and instant types never block their
  write.

## Considered options

- **An events table fed by triggers** — rejected. It is a second copy of history that drifts from
  the tables it copies, needs a backfill, and must be taught every new source twice. A read-time
  merge needs one adapter per source and nothing else.
- **Keep notes on `customers` and hide them with a policy** — rejected. RLS selects rows, not
  columns; the customer's own-row policy must keep returning the row. Column grants do hide a
  column, and a separate table also gives each note an author, a date and an append-only history.
- **Segments in `site_settings`** — rejected. Anyone can read `site_settings`
  (`20260308000000_create_site_settings.sql`), and a Segment's filters describe customers.
- **A `customers:read` (or `customers-view`) key**, as ADR 0023 anticipated for view-only access
  — rejected. The sidebar href, the page guards and every existing read already check
  `customers`. Adding the *edit* key instead changes only the handful of write paths, keeps ADR
  0023's boolean matrix and subset rule, and the data migration only adds a key, so nobody loses
  access.
- **A third cron for CRM jobs** — rejected. Vercel Hobby allows two, and both are used. Reminders
  and digests are day-granular, so chaining onto `results-sla` loses nothing.
- **Reusing `order_emails` for aftercare** — rejected. It is keyed by `(order_id, template)`,
  while a Review request is once per Customer, and its failed rows are final
  (`dispatchOrderEmail` claims with `ignoreDuplicates`, `lib/email/index.ts:159-216`).
- **Asking only customers who seem satisfied** (no return, no refund request, a good rating, a
  positive note) — rejected. Google's review policy forbids it, and Google removes reviews and
  restricts profiles for it.
- **Linking Google reviews automatically by name** — rejected. Names collide, and a review-link
  click may be a mail scanner. A suggestion with a Staff confirmation is the most the facts allow.
- **A Staff-ticked "verified" box for email or mobile** — rejected. It records an opinion, goes
  stale, and nothing verifies a phone number by code. Every part of Contact status points at a
  fact.
- **The check-up as a service message with no consent** — rejected (research, 2026-10-20). Meta's
  template category does not change what the PDPA calls it. The owner may relax the email rule if
  counsel advises.
- **A reminder about the free re-adjustment window** — dropped by the owner on 2026-10-20 in
  favour of the Review request.

## Consequences

- **Grants are now load-bearing.** Every new `customers` or `orders` column is invisible to the
  customer until it is granted, as `20261013110000_order_items_kind.sql:23-26` does for
  `order_items`. Migration slice 07's `marketing_email` is the first: whichever of it and CRM
  slice 02 lands second adds the grant. The shopper's order query lists its columns instead of
  `select *`.
- **A new per-customer source is a new timeline adapter**, with no backfill. The migration
  slices that create one (imported, signed up, claimed and voucher, consent, campaign sends) add
  their own adapter, and nothing else in the CRM changes.
- **Results join the timeline the way the storefront matches them**: `customer_id` equal, or the
  lower-cased emails equal (`lib/results/access.ts:30-36`). A Result has no time per status, so
  the timeline never invents one.
- **`resolveSegment` is the seam to `PRD-email-marketing`.** Email marketing narrows a Segment
  by consent and suppression, and never re-implements the filters. No CRM slice builds a
  Campaigns page, a composer, or a marketing send.
- **Every write under Customers checks `customers-edit`.** A route left on `customers` fails the
  guard test. The follow-up assignee picker lists only profiles whose **Member** can close one.
- **The Review request is timed from `orders.delivered_at`.** Orders never marked delivered are
  counted as an operations signal, not emailed.
- **The check-up states its fee**, read from Costings (`service_prices.readjustment`) at send
  time. If the fee cannot be read, nothing is sent. The re-adjustment rule itself, including the
  **Complimentary re-adjustment** window, stays with
  [ADR 0024](0024-services-priced-in-costings.md) and is not edited here.
- **WhatsApp reaches few customers.** With no checkout checkbox, it goes only to those who turned
  it on in their Profile or told Staff they agree. Email carries the message; a failed WhatsApp
  send is not retried.
- **Only a Staff action inserts into `customer_google_reviews`**, and a rejected pair is never
  suggested again.
- **No PII in Telegram from the CRM.** The online Result notice is today's build-team notice and
  keeps its content; only its switch is new.
- **Out of scope by these rules:** journey analytics on the timeline
  ([ADR 0007](0007-first-party-journey-analytics.md)'s consent boundary), customisation appointments on the timeline (their reminder rows carry no Customer
  link), segment CSV export, and merging two Customers.
- Glossary terms: **Customer note**, **Customer timeline**, **Segment**, **Follow-up**,
  **Aftercare message**, **Review request**, **Linked Google review** and **Contact status** in
  `CONTEXT.md`.

## Related

- [ADR 0028 — Shopify customer migration](0028-shopify-customer-migration.md): the Customer
  overview the CRM's columns and filters extend, and the *facts, not statuses* rule (k, l).
- [ADR 0024 — Services are priced in Costings](0024-services-priced-in-costings.md): the
  re-adjustment rule and the fee the check-up states.
- [ADR 0006 — Analytics reads DB channel facts](0006-analytics-db-channel-facts.md): the
  precedent for chaining a daily job onto `results-sla` instead of a third cron.
- [ADR 0023 — RBAC: roles are data, permissions are code](0023-rbac-roles-are-data-permissions-are-code.md):
  the permission catalog `customers-edit` joins.
