# 10 — Points for past purchases

**Issue:** not filed
**Type:** AFK, then HITL (the owner runs it from Settings → Discounts → Points)
**Status:** built; not yet run in production
**Blocked by:** 02
**Labels:** `enhancement`, `area:admin`, `area:db`, `area:migration`

## Goal

A customer imported from Shopify starts with points for what they already bought there (owner,
2026-11-08: "backfill points based on the amount of the orders"). ADR 0030, amendment of
2026-11-08 (decision 18, rules x to z).

## What was built

- **Ledger kind `past_purchases`**, positive, one per Customer
  (`20261108100100_past_purchase_points.sql`).
- **`points_past_purchase_candidates`**: Migrated customers whose spend earns a point, not yet
  given any, not partners. Points are `floor(earn rate × shopify_amount_spent)`.
- **`past_purchase_points_preview()`** and **`grant_past_purchase_points(profile, customers,
  points)`**: the run is refused unless the candidates are still what the preview showed.
- **`/api/settings/discounts/points/past-purchases`** (GET preview, POST run), under `discounts`,
  audited as `points.past_purchases_grant`.
- **Settings → Discounts → Points**: a *Points for past purchases* panel with the preview and a
  confirmation; the cost summary counts what was given.
- The Staff card labels the entry *Points for past purchases*, with the spend in its note. The
  terms gain a section and are dated 8 November 2026; the Staff guide's launch checklist runs it
  before launch.

## Owner decisions (2026-11-08)

- A Staff-run backfill with a preview, not a grant at each Claim.
- They don't count towards milestones.

## Acceptance criteria

- [x] A run grants each candidate once; a second run grants nothing; a later import is granted
      once (`supabase/tests/loyalty-points/assert-10-past-purchases.sql`).
- [x] Partners and customers whose spend is under one point get none.
- [x] Milestone progress is unchanged by them.
- [x] A run whose numbers moved since the preview is refused and writes nothing.
- [ ] The accountant knows the liability before the run (about 793k points, S$7.9k, at 1 point
      per S$1, in production on 2026-11-08; the owner lowered the rate from 3 the same day).
- [ ] The owner runs it, before points launch.
