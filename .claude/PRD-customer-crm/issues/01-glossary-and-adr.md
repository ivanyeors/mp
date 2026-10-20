# 01 — Glossary and ADR 0027: what the CRM is made of

**Type:** AFK
**Blocked by:** none
**User stories:** underpins all
**Labels:** `enhancement`, `needs-triage`, `P2`, `area:customers`, `area:docs`

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

**Care reminder** — a service email about something the **Customer** bought. The first one is
*"your free re-adjustment is available until {date}"*. It is sent through the transactional
transport and recorded in `order_emails`. It carries its own opt-out and never an offer.
_Avoid_ — calling it marketing, or gating it on **Marketing consent** (migration PRD).
Anything promotional belongs to `PRD-email-marketing`.

**Contact status** — what is known about how to reach a **Customer**, each part derived from
a fact:

- **Verified email:** they have signed in with it.
- **Sign-in methods:** emailed code, Google.
- **Valid mobile:** the number on file passes `isValidPhone`.
- **Replied on WhatsApp:** the number answered an **Appointment reminder**.

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
- **(f) A Care reminder is a service message.** It uses the transactional transport, the
  `order_emails` ledger, its own opt-out and no offer. It calls `evaluateReadjustment`, never a
  restated rule.
- **(g) No third cron.** CRM jobs chain onto `results-sla` (ADR 0006's precedent).
- **(h) The CRM sends no marketing.** It hands Segments and timeline history to
  `PRD-email-marketing`. The periodic check-up reminder is a service message (owner,
  2026-10-20) under (f)'s rules.
- **(i) Seeing and changing are separate keys.** `customers` means seeing the Customers page;
  `customers-edit` (which requires `customers`) covers every change. Existing roles are
  migrated to hold both, and a guard test keeps writes on `customers-edit`.
- **(j) Contact status is derived.** It comes from sign-in, sign-in identities and WhatsApp
  replies, never from a Staff-set flag.

## Acceptance criteria

- [ ] `CONTEXT.md` carries the six terms above with `_Avoid_` lines.
- [ ] `docs/adr/0027-customer-crm.md` records (a)–(j). It links ADR 0026 (the Customer overview
      and the "facts, not statuses" rule), ADR 0024 (the re-adjustment rule) and ADR 0006
      (cron chaining).
- [ ] `./scripts/graphify update .` is run in the same commit.
