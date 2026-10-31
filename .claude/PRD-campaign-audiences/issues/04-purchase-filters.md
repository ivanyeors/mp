# 04 — Purchase filters: didn't buy, pillow size, delivered, sub-status

**Issue:** not filed
**Type:** AFK
**Status:** built 2026-10-31 (`20261031144619_customer_overview_purchase_filters.sql`; applied to production 2026-10-31)
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

## As built

- **Stage sub-statuses** need one more overview column, `lifecycle_statuses` (the stage and its
  sub-status, `{at_risk,lapsed}`). A sub-status name never repeats a stage's, so a mix such as
  `stage=new,at-risk:lapsed` is one overlap, not an `or` (ADR 0028 (d)). Main stages alone still
  filter on `lifecycle_stage`. A sub-status beside its own stage is dropped (the stage holds it),
  and in the panel its box shows ticked and locked.
- **Pillow size** reads `customer_purchase_lines.size`, appended to that view (`classifyOrderLine`'s
  size: a Result's `assigned_size`, else the pillow product's), aggregated into `pillow_sizes`.
- **Delivered** is the *latest purchase's* delivery (`last_delivered_at`), the same Order that
  gives a New Customer's sub-status, so someone with a newer order still on its way matches
  neither *within* nor *over*. Presets 7, 14, 30 days and over 30, 60, 90; a link may carry 1–730.
- No `filters_version` bump: no stored value changed meaning.

## Acceptance criteria

- [x] `campaign-rule-cases.json` is untouched: filters choose, the claim rule decides.
- [x] Each filter has a mapping test (`lib/crm/__tests__/customer-filters.test.ts`) and a SQL
      check against the overview: `lib/crm/purchase-lines.check.ts` (sizes, *Didn't buy*,
      *Pillow size*) and `lib/crm/lifecycle-stage.check.ts` (sub-statuses, *Delivered*,
      `last_delivered_at`, `lifecycle_statuses`), both passing on a database with every migration
      applied.
- [x] *Didn't buy* and *Bought* together (`bought=premium&not_bought=mbolster`) is one query:
      `bought=ov.{premium}&bought=not.ov.{mbolster}`.
- [x] No filter reaches the review request job.
