# 08 — Check-up reminder: the periodic "time for a re-adjustment"

**Type:** AFK
**Blocked by:** 07; owner decision 2 (timing and coverage)
**User stories:** 24
**Labels:** `enhancement`, `needs-triage`, `P3`, `area:customers`, `area:email`, `area:readjustment`

## Decided

**This is a service message** (owner, 2026-10-20). It is built here, as an **Aftercare email**
under the same rules as slice 07's review request. It does not move to `PRD-email-marketing`.

What makes it a service message, and must stay true:

- it is about a product the customer owns;
- it carries no offer, discount or other product;
- it honours the same `aftercare_emails` opt-out;
- it goes at most once per milestone per Order.

If the copy ever needs an offer, it stops being an Aftercare email and belongs to email
marketing. Have counsel read the final copy once before it goes live; this is a check, not a
gate.

## Goal

Some months after delivery, a pillow owner hears that a re-adjustment keeps the pillow
fitting them. The visit is **paid**: after the free window, the fee applies (ADR 0024). So the
email states only that the fee applies, and links to the Services page and to booking at
`/appointments?type=readjustment&item=<order_item_id>`. That page sends a signed-out visitor
through Sign in and back (`app/[lang]/appointments/page.tsx:49-56`).

## Who gets it

This reuses slice 07's machinery:

- the same daily job, chained onto `results-sla`;
- the same `aftercare_emails` opt-out;
- the transactional transport.

Its ledger is `order_emails`, with template `aftercare.checkup_<months>m`, so each milestone
sends once per Order through the table's `unique(order_id, template)`.

- **When:** the first run on or after `delivered_at + checkup_months` (default 12).
- **Skip:** a Customer with a **Re-adjustment booking** booked or attended within the previous
  `checkup_months`. Skipped Customers are counted, not emailed.
- **Coverage:** owner decision 2 picks Premium only, every Mpillow, or Mbolster too. It is read
  from `customer_purchase_lines` (slice 04). If slice 04 has not landed, use `classifyOrderLine`
  (`lib/readjustment/purchases.ts:80-122`) directly.

## Settings

These are `site_settings` keys, edited on slice 07's Aftercare card:

- `checkup_reminders_enabled` (default **false**);
- `checkup_months` (12);
- `checkup_covers`: `premium` | `all_pillows` | `pillows_and_bolsters`.

## Acceptance criteria

- [ ] vitest covers the timing and skip rules as a pure function: on time, already re-adjusted
      within the period, opted out, and not delivered.
- [ ] Each Order gets at most one email per milestone, through the `order_emails` unique key.
- [ ] The rendered email contains no price other than "the re-adjustment fee applies", and no
      other product.
- [ ] The Aftercare card shows check-ups sent, skipped by reason, and bookings that followed.
- [ ] `./scripts/graphify update .` is run in the same commit.
