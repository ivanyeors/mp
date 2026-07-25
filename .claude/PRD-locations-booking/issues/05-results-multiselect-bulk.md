# 05 — Results multi-select + bulk actions

## Parent

[PRD — Locations, Result Location, SLA relocation & custom booking](../locations-booking-prd.md)

## What to build

Let operators act on many **Results** at once instead of row by row.

- Add a leading checkbox column beside **Updated**; a header checkbox selects every row on
  the page. Selection is component state (a `Set` of ids); plain checkbox, no table library.
  Checkboxes `stopPropagation` so row click still navigates.
- Show a bulk action bar when ≥1 row is selected:
  - **Set Location** → a location `<Select>` applied to all selected (reuses the upsert).
  - **Send Group Updates** → reuse the per-row Telegram send in a loop.
  - **Delete** → reuse the per-row delete in a loop behind the existing confirm dialog.
  - **Export CSV** → client-side via a pure `rowsToCsv(rows)` helper.
- Unit test `rowsToCsv`: header row, field order, escaping of commas/quotes/newlines.

## Acceptance criteria

- [ ] Per-row checkbox + header select-all work; selecting does not navigate
- [ ] Bulk Set Location updates all selected Results (persists on reload)
- [ ] Bulk Send Group Updates fires the Telegram send for each selected Result
- [ ] Bulk Delete removes all selected behind a confirm
- [ ] Bulk Export downloads a CSV of the selected rows
- [ ] `rowsToCsv` unit test passes (escaping + headers)

## Blocked by

- #04 (Location column — needed for bulk Set Location and the shared table)
