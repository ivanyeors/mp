# Unified filling editor 06: Result assign uses the X-ray editor; delete the 3x3 grid

Tracker: #115
Parent: PRD `unified-spatial-filling-editor` (`.claude/PRD-unified-spatial-filling-editor/unified-spatial-filling-editor-prd.md`)
Status: **Done — merged to main via PR #117 (91fc61ab) 2026-09-10.**
Criteria verified against the merged code, its unit tests and the `.check.ts`
self-checks, except where noted inline with `[~]`.

## Parent

#109 — PRD: Unified Spatial Filling Editor

## What to build

The third and last surface, and a net deletion.

With Configure converted in slice 05, the **Result** detail assign editor is the only place left rendering the 3×3 dropdown grid. Converting it means **Staff** meet one filling interaction everywhere — assisting a live customer, authoring a catalog **Filling Template**, and assigning a **Filling configuration** to a **Result** — instead of learning the x-ray for one and a grid for the other two.

**The swap.** Same wrapper and same component as slice 05. The page already loads filling items carrying id, label, name, subtype and size — structurally a superset of what the x-ray needs — so no new fetching. Colour overrides reach it the same way they reach Configure: from a server route, never a browser query against the service-role-only override table. The **Spatially authored** warning renders here too when the loaded recipe occupies a single **Section**.

**The deletion.** Once nothing renders the grid, the component goes. It exports three pure helpers alongside itself — a cell-ordering constant and the two functions that convert between per-**cell** item lists and **Placement** rows — and the order detail page imports one of them. Those helpers move into the spatial-fillings library, where the **cell** and **Section** vocabulary already lives, and their existing round-trip unit test moves with them unchanged. That test is the regression guard proving the move was a move and not a rewrite. Then the component file is removed.

**The guard.** A self-check asserting that neither **Admin Panel** filling surface imports the deleted grid and that both mount the x-ray, so a future surface cannot quietly fork the interaction again. Prior art: `lib/rules-engine/slice-07.check.ts`, which asserts by source inspection that two routes ship placements.

**Mbolster** keeps its compartment list on this page too — same reasoning as slice 05.

Demoable outcome: open a **Result** with an assigned pillow size and tier, edit its **Filling configuration** in the same x-ray used everywhere else, save, and confirm the order detail page still renders its cell summary correctly after the helper move.

## Acceptance criteria

- [x] The **Result** detail assign editor renders the **X-ray editor** for pillow **Filling configurations** in place of the 3×3 grid.
- [x] Diving, the radial picker, depth reordering and chip removal all work there, identically to Configure and the configurator.
- [x] Pouch colours match the other two surfaces, sourced from a server route rather than a browser query.
- [x] A single-**Section** recipe shows the **Spatially authored** warning, advisory and non-blocking.
- [x] Saving persists the **Filling configuration** snapshot including stack depth, and the derived pack list still reflects it.
- [x] The three pure helpers move into the spatial-fillings library and the order detail page imports them from their new home.
- [x] The existing round-trip unit test for those helpers moves with them and passes unchanged.
- [x] The 3×3 grid component file is deleted and nothing imports it.
- [x] The order detail page's cell summary renders correctly after the move.
- [x] A self-check asserts both **Admin Panel** filling surfaces mount the x-ray and neither imports the deleted grid.
- [x] The **Mbolster** compartment list on this page is unchanged.
- [~] The slice is a net deletion in lines of code.
      Not met as stated: +238/-151 excluding the knowledge graph, a net +87. The grid
      component did go, but lib/spatial-fillings/cells.ts (41) and
      surface-parity.check.ts (79) more than replaced it. The intent — one filling
      editor in the codebase — was achieved.
- [x] `npm run build` and the repo's type-check and test suites pass.
- [x] `./scripts/graphify update .` run and the refreshed graph committed alongside the code.

## Blocked by

- #114 (Configure must be converted first; the grid cannot be deleted while it renders it)

