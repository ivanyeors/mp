# Unified filling editor 04: Admin template route — colour overrides in GET, depth bound matched to the validator

Tracker: #113
Parent: PRD `unified-spatial-filling-editor` (`.claude/PRD-unified-spatial-filling-editor/unified-spatial-filling-editor-prd.md`)
Status: **Done — merged to main via PR #117 (91fc61ab) 2026-09-10.**
Criteria verified against the merged code, its unit tests and the `.check.ts`
self-checks, except where noted inline with `[~]`.

## Parent

#109 — PRD: Unified Spatial Filling Editor

## What to build

Two corrections to the **Admin Panel** filling-template route, both prerequisites for mounting the **X-ray editor** there in slice 05.

**Colour overrides on read.** The x-ray colours each pouch through a per-subtype CSS variable, with **Product Builder** overrides supplying the value and a code default behind it. The configurator gets those overrides from its staff-assist endpoint. The **Admin Panel** has no such source, so an x-ray mounted there today would render every pouch on the code default — the same pillow in two different colour schemes depending on which surface you opened. The override table is service-role-only under row-level security, so the browser client cannot query it directly and must not be given a policy to do so. The route's read response carries the overrides instead, matching how the staff-assist endpoint already supplies them.

**Depth bound.** The update schema caps `row_index` at 1, left over from when the column was a two-value top/bottom lane. The 2026-07-21 migration relaxed the database constraint to the full per-**cell** depth range, and the placement validator was updated to match — but the request schema was not. So the authoring API rejects any stack deeper than the second layer, while the database and the validator both accept it. That is invisible today because no template has depth at all; it becomes a hard blocker the moment slice 05 lets **Staff** drag pieces into a deeper stack.

Raise the bound to the range the validator already enforces, deriving it from the same constant rather than restating the number, and add a self-check asserting the two cannot drift apart again.

Demoable outcome: the route's read response includes colour overrides, and a placement with a stack depth of four saves successfully instead of failing shape validation.

## Acceptance criteria

- [x] The **Admin Panel** filling-template read response includes per-subtype colour overrides.
- [x] Overrides are read server-side with the admin client; no row-level-security policy is added or relaxed, and the browser never queries the override table.
- [x] The update schema's `row_index` bound is derived from the same constant the placement validator uses, not a restated literal.
- [x] A placement with a stack depth of four is accepted by the route and persisted.
- [x] A placement with a stack depth above the cap is still rejected, with the validator's message rather than a raw schema error.
- [x] A self-check asserts the request schema's depth bound matches the validator's, and fails if they drift.
- [x] Semantic validation still runs through the spatial-fillings validator per kind; the schema stays a shape gate only.
- [x] Bolster templates are unaffected — no depth column, no section columns.
- [x] No schema change and no **Placement** row modified.
- [x] `./scripts/graphify update .` run and the refreshed graph committed alongside the code.

## Blocked by

None — can start immediately.

