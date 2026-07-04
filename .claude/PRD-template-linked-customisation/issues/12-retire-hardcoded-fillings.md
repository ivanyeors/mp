# Slice 12 — Retire hardcoded fillings; LLM proposal field hooks

Type: AFK
Parent: PRD `template-linked-customisation` (`.claude/PRD-template-linked-customisation/template-linked-customisation-prd.md`)
User stories covered: 6, 40

## What to build

Make Configure Filling Templates the only purchase-path filling source; leave LLM hooks unused but present.

- Remove or bypass hardcoded `FILLING_SPECS` / dual suggestion engines for the online purchase path so sold builds never depend on code recipes.
- Ballpark size×tier / length suggestion may remain rule-based; fillings for sale come only from operator-selected Filling Templates.
- Confirm `proposed_*` fields exist on Result and are unused (no model calls).
- In-store measurement-only Results (slice 13) may still show a non-binding size×tier suggestion without creating a hold; that suggestion must not invent fillings for sale.

## Acceptance criteria

- [x] Online purchase path does not read hardcoded filling recipes for what gets sold or fulfilled.
- [x] Captured Orders' filling lines always match the assigned Filling Template (+ prefs/add-ons), not `FILLING_SPECS`.
- [x] Customer flows still do not expose filling or protector pickers.
- [x] `proposed_*` columns/fields exist and remain null/unused in v1.
- [x] No LLM provider integration is added.

## Status

**Done** on `cursor/retire-hardcoded-fillings`.

- `purpose: "ballpark"` on `/api/shop/customize` — mp-config/mbolster-config get size-only recommendations (no `FILLING_SPECS`)
- `recommendSizeFromPreferences` / `recommendSizeFromMeasurements` — rule-based ballpark, empty `filling_lines`
- `FILLING_SPECS` retained for mp-maker legacy `?action=apply` only (ponytail comment in `rules.ts`)
- Capture/fulfill path unchanged: `loadAssignedBuild` → Filling Template via `assembleBuild`
- `proposed_*` columns in `0044_results.sql`; no TS writers
- Tests: `lib/results/__tests__/slice-12-no-hardcoded-fillings.test.ts`

## Blocked by

- Slice 07 (template-driven capture path live)
- Slice 02 (Filling Templates)
