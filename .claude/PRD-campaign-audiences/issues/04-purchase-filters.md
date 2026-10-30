# 04 — Purchase filters: didn't buy, pillow size, delivered, sub-status

**Issue:** not filed
**Type:** AFK
**Status:** not started
**Blocked by:** none
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`

## Goal

The Playbooks' audiences can be described. The demo: *Bought Premium · Didn't buy Mbolster ·
Delivered over 30 days ago* lists the right people, saves as a Segment, and is an Audience.

## What to build

Each one a parameter in `lib/crm/customer-filters.ts` (schema, `customerFilterParams`, summary
label, `applyCustomerFilters`) and a control in the filters panel, so it is a Segment and an
Audience with no other change:

- **Didn't buy** (`not_bought=mbolster`): none of these classes on any counted Order. The
  complement of `bought`, read from the same overview column.
- **Pillow size** (`size=m,l`): owns a pillow of any of these sizes, from
  `customer_purchase_lines.pillow_id` → `pillow_products`. A new overview column `pillow_sizes`.
- **Delivered** (`delivered=over:30`, `within:14`): days since the latest purchase was delivered.
  A new overview column `last_delivered_at`. Days, not months, because Playbooks are timed in
  days.
- **Stage sub-status**: the Stage filter takes `new:awaiting-delivery`, `new:delivered`,
  `new:settled`, `loyal:repeat-purchases`, `loyal:bookings`, `at-risk:lapsed`, beside the main
  stages. Read from the overview's `lifecycle_detail` (`customer_lifecycle_detail`,
  `20261028084009_lifecycle_funnel.sql`). Retention slice 07 asked for *Lapsed*; this does all of
  them.

A Segment saved with an older `filters_version` still reads (`readSegmentFilters`); bump the
version only if a stored value changes meaning.

## Acceptance criteria

- [ ] `campaign-rule-cases.json` is untouched: filters choose, the claim rule decides.
- [ ] Each filter has a mapping test (`lib/crm/__tests__/`) and a SQL check against the overview.
- [ ] *Didn't buy* and *Bought* together (`bought=premium&not_bought=mbolster`) is one query.
- [ ] No filter reaches the review request job.
