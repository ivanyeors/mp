# 01 — Glossary and ADR 0027: what the CRM is made of

**Issue:** [#278](https://github.com/ivanyeors/mp/issues/278) (parent #277)
**Type:** AFK
**Status:** built in `a9f1e95` on `claude/shopify-migration-plan-izv7fo`
**Blocked by:** none
**User stories:** underpins all
**Labels:** `documentation`, `enhancement`, `needs-triage`, `P2`, `area:admin`

## Goal

Name the five things before any table is created. "CRM" invites two wrong designs:

- **a second copy of the history.** An events table fed by triggers drifts from the tables it
  copies.
- **a marketing tool.** That is `PRD-email-marketing`'s job.

These terms close both doors.

## CONTEXT.md entries

**Customer note** — a dated, authored remark by **Staff** about a **Customer**, in
`customer_notes`. Only the service role can read it. Notes are never edited; a correction is a
new note.
_Avoid_ — `customers.notes`. The Customer can read their own row (`0037_customer_auth.sql:14-18`),
so that column is retired.

**Customer timeline** — everything that happened with a **Customer**, newest first, merged
when it is read from the tables that already record it: **Orders**, **Results**,
**Re-adjustment bookings**, returns, reviews, emails, notes and follow-ups.
_Avoid_ — "activity log" or "events table". Nothing is copied. Each kind is shown only to
**Staff** holding that source's permission.

**Segment** — a named, saved set of Customers-list filters, shared by all Staff with
`customers` and counted live. A **Segment** and the same filters in the URL always return the
same Customers.
_Avoid_ — "list" (a Segment is a query, not a frozen set of people), and "audience" (that is
email marketing's word for a Segment narrowed by consent).

**Follow-up** — a dated to-do about one **Customer**, assigned to a **Staff profile**, and
done or not done.
_Avoid_ — "task" or "ticket". It is not a support queue. Do not assign it to a **Member** or a
login: a person works as a profile.

**Aftercare message** — a service message, by email and WhatsApp, about something the
**Customer** bought. There are two:

- the **Review request**, once per Customer, 14 days after delivery;
- the **Check-up reminder**, yearly, stating that the visit is paid and its fee.

Email uses the transactional transport and is on unless switched off (`aftercare_email`).
WhatsApp is off until the customer opts in (`aftercare_whatsapp`). Every change is recorded
with who made it and how. Neither ever carries an offer.
_Avoid_ — calling it marketing, or gating it on **Marketing consent** (migration PRD).
Anything promotional belongs to `PRD-email-marketing`. There is no email about the free
re-adjustment window (owner, 2026-10-20).

**Review request** — the one email that asks a **Customer** for a Google review, with an
unconditional *"need anything else? message us"* line. It goes to every eligible Customer
alike.
_Avoid_ — choosing who is asked by satisfaction, returns or ratings, or offering anything for
a review. Both break Google's review policy.

**Linked Google review** — a Google review that **Staff** have confirmed belongs to a
**Customer**. Google never says who wrote a review, so the code only suggests a match, from the
name and the timing of a **Review request**.
_Avoid_ — linking automatically, or treating a review-link click as proof of a review.

**Contact status** — what is known about how to reach a **Customer**, each part derived from
a fact:

- **Verified email:** they have signed in with it.
- **Sign-in methods:** emailed code, Google.
- **Valid mobile:** the number on file passes `isValidPhone`.
- **Replied on WhatsApp:** the number has written to our WhatsApp line (`whatsapp_inbound`; CRM 11).

_Avoid_ — "verified mobile". Nothing verifies a phone number by code. Never let Staff tick
"verified".

## ADR 0027 — decisions to record

- **(a) Staff-only notes live in `customer_notes`.** `customers.notes` stops being written and
  its text is moved there. Column grants hide `customers.notes`, `customers.tags` and
  `orders.internal_notes` from the authenticated role. This follows the `order_items`
  precedent (`20260915170000_hide_variant_cost_price.sql`).
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
- **(g) No third cron.** CRM jobs chain onto `results-sla` (ADR 0006's precedent).
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

## Acceptance criteria

- [x] `CONTEXT.md` carries the eight terms above with `_Avoid_` lines.
- [x] `docs/adr/0027-customer-crm.md` records (a)–(m). It links ADR 0028 (the Customer overview
      and the "facts, not statuses" rule), ADR 0024 (the re-adjustment rule) and ADR 0006
      (cron chaining).
- [x] `./scripts/graphify update .` is run in the same commit.

## Build notes

- **What was built.** A `## Customer CRM (ADR 0027)` section in `CONTEXT.md`, placed after
  `## Reviews`, holding the eight terms in the file's `**Term**:` / `_Avoid_:` format. The new
  `docs/adr/0027-customer-crm.md` (Status, Context, Decisions, Considered options, Consequences,
  Related), whose (a)–(m) are the slice's text word for word. The only change is that (g) links
  ADR 0006.
- **Links.** ADR 0028 as `0028-shopify-customer-migration.md`, the filename migration slice 01's
  acceptance criteria give it. That file is written in parallel and does not exist on this
  branch yet. ADR 0024, 0006, 0023 and 0007 are linked by their real filenames. `docs/adr/` has
  no index to update.
- **Migrations and tests.** None. This is a docs slice. A scratch check confirmed each term is
  defined once, inside the section, with an `_Avoid_` line, and that the ADR carries (a)–(m) and
  the three required links.
- **Deviations.**
  - The entries use the file's `_Avoid_:` form, not the slice's `_Avoid_ —`. Lists are written
    inline, because a list would swallow the `_Avoid_` line into its last item.
  - **Aftercare message**'s `_Avoid_` line names the **Check-up reminder** as the one exception
    to "not gated on Marketing consent". Without that, the entry would contradict ADR 0027 (h)
    and the README's second hazard.
  - **Review request** says "one message, by email and (when they opted in) WhatsApp", not "the
    one email", to match slice 07 and the **Aftercare message** entry.
- **Left for others.** The graph refresh (integrator). The migration PRD's terms, including
  **Marketing consent**, which these entries refer to by name, come from migration slice 01.
