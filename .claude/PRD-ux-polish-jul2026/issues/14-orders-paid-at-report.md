# Slice 14 — Orders sales report by paid_at

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 29–30

## What to build

Wire Orders `date_from` / `date_to` through list and dashboard APIs using **`paid_at`** (sales window). Refetch summary when the range changes. Unpaid/pending without `paid_at` fall outside the range. v1 report = filtered list + summary cards (no CSV). Automated check for date-range helper/query behavior.

## Acceptance criteria

- [x] Changing date range filters Orders list by `paid_at`.
- [x] Summary cards match the same `paid_at` window.
- [x] Orders with null `paid_at` are excluded from a bounded sales range.
- [x] Invalid from > to rejected or corrected with clear feedback.
- [x] Automated check for paid_at range filtering.

## Proof (2026-07-13)

List + dashboard APIs apply `parseOrdersPaidAtRange` / `applyOrdersPaidAtRange` on `paid_at`. UI refetches summary with the same params and surfaces from>to via `role="alert"`.

```bash
npx tsx lib/ecommerce/orders-paid-at-range.check.ts
# → orders-paid-at-range.check.ts: ok
```
