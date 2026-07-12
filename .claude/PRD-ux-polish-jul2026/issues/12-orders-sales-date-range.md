# Slice 12 — Orders sales report by date range

Type: AFK
Parent: PRD `ux-polish-jul2026` (`.claude/PRD-ux-polish-jul2026/ux-polish-jul2026-prd.md`)
Triage: needs-triage
User stories covered: 19–20
PR group: **G**

## What to build

Orders UI already sends `date_from` / `date_to`, but APIs ignore them and dashboard stats are all-time. Wire date range through:

1. `GET /api/shop/orders` — filter by date range (document: `created_at` vs paid-at; pick one).
2. `GET /api/shop/orders/dashboard` (or equivalent summary) — same range so cards match the list.
3. Client: refetch summary when range changes; empty range = current default (all-time or last N days — document).

v1 “generate report” = filtered list + summary for the period. CSV/PDF export out of scope unless already trivial.

Primary paths:

- `app/[lang]/settings/orders/page.tsx`
- `app/api/shop/orders/route.ts`
- `app/api/shop/orders/dashboard/route.ts`
- Optional UX reuse from `app/[lang]/settings/analytics/page.tsx` date controls

## Acceptance criteria

- [ ] Changing date range updates the orders list to only orders in range.
- [ ] Summary cards update for the same range (not stale all-time).
- [ ] Invalid ranges (from > to) are rejected or swapped with clear UI feedback.
- [ ] Automated check for date filter helper / query param parsing.

## Proof

```bash
npx tsx app/api/shop/orders/orders-date-range.check.ts
# → ok (create with the slice)
```

Manual: pick last 7 days on staging Orders → list count matches expectation.

## Blocked by

None — independent admin slice (PR G).
