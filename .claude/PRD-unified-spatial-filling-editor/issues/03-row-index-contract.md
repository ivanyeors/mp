# Unified filling editor 03: row_index contract — stack depth survives loading a template into Staff assist mode

Tracker: #112
Parent: PRD `unified-spatial-filling-editor` (`.claude/PRD-unified-spatial-filling-editor/unified-spatial-filling-editor-prd.md`)

## Parent

#109 — PRD: Unified Spatial Filling Editor

## What to build

A one-field bug fix plus the guard that stops it recurring.

Six routes read pillow **Placement** rows. Five select `row_index` — the shop customise route, the mp-basic recommend route, the staff-assist context route, and the **Admin Panel** template route. One does not: the staff-assist endpoint that loads a **Filling Template** into the **X-ray editor**. Because `row_index` is absent, the mapper that turns rows into placements leaves the depth undefined, and the layout engine falls back to auto side-by-side packing.

The consequence is that **Staff** and the shopper can render the same template differently. A template authored with a stacked **cell** — pieces layered front-to-back, which the x-ray draws with a depth offset and a darkening scrim — loads into **Staff assist mode** flattened into a row. The x-ray exists so **Staff** can compare it against the physical build (ADR 0009 guardrail 3, deterministic rendering); a surface that silently drops a dimension of the recipe defeats that.

This matters more after slice 05, not less: once templates are authored in the **X-ray editor** with real stack depth, every stacked **cell** will disagree between surfaces.

Fix the query, then add a self-check that asserts every route reading pillow placement rows selects `row_index`, so a seventh reader cannot reintroduce it. Prior art for the check style: `lib/spatial-fillings/api-contract.check.ts`, which already asserts placement table names across routes by source inspection.

Demoable outcome: author a template with a stacked **cell** through the **Admin Panel**, load it in **Staff assist mode**, and the stack renders as a stack rather than a row.

## Acceptance criteria

- [ ] The staff-assist template-placement query selects `row_index` for pillow templates.
- [ ] Bolster templates are unaffected — they have a single compartment and no depth column.
- [ ] A template with a stacked **cell** loads into **Staff assist mode** with its depth intact and renders with the depth offset and scrim.
- [ ] A template with all-null `row_index` still renders auto side-by-side, unchanged.
- [ ] A self-check asserts that every route reading pillow **Placement** rows selects `row_index`, and fails if one does not.
- [ ] The self-check is runnable standalone and named in the acceptance proof, matching the repo's `.check.ts` convention.
- [ ] No schema change and no **Placement** row modified.
- [ ] `./scripts/graphify update .` run and the refreshed graph committed alongside the code.

## Blocked by

None — can start immediately.

