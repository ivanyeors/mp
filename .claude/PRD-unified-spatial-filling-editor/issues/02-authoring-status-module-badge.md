# Unified filling editor 02: authoring-status module + unauthored badge on the template list

Tracker: #111
Parent: PRD `unified-spatial-filling-editor` (`.claude/PRD-unified-spatial-filling-editor/unified-spatial-filling-editor-prd.md`)
Status: **Done — merged to main via PR #117 (91fc61ab) 2026-09-10.**
Criteria verified against the merged code, its unit tests and the `.check.ts`
self-checks, except where noted inline with `[~]`.

## Parent

#109 — PRD: Unified Spatial Filling Editor

## What to build

The first end-to-end tracer: a pure module that decides whether a **Filling Template** is **Spatially authored**, wired through the list endpoint to a visible badge in the **Admin Panel**.

**The module.** A pure, browser-safe addition to the spatial-fillings library holding the entire definition of "has this recipe been laid out": which **Sections** a placement list occupies, and the single predicate the three surfaces branch on. This is the only place in the codebase that knows a single-**Section** recipe is suspect — slices 05 and 06 both import it rather than re-deriving the rule. No I/O, no React. Bolster recipes have no **Section** enum and are never evaluated by it.

**The query.** The Configure templates list endpoint currently returns template columns only, with no placement data, so the badge has nothing to compute from. It needs per-template **Section** coverage — a grouped count, not a full placement fetch; the list renders up to a few dozen templates and must not issue a query per row.

**The badge.** In the filling-template list on the Configure page, any template that is not **Spatially authored** carries a visible marker. Hovering or expanding it explains that the placements were auto-generated from a legacy flat recipe and have never been laid out — not that they are invalid. Advisory only: nothing is blocked, nothing is disabled. The badge is derived from live data, so it disappears on its own as soon as a template gains a second **Section**, with no manual checklist to maintain.

**The count.** A summary line stating how many of the listed **Filling Templates** are not yet **Spatially authored**, so the authoring pass in slice 07 has a progress signal.

Demoable outcome: open Settings → Inventory → Configure on a pillow card and see all ten default **Filling Templates** flagged, with a count. Place pieces in a second **Section** through the existing editor and that template's flag clears on reload.

## Acceptance criteria

- [x] A pure module in the spatial-fillings library exposes the **Section** coverage of a placement list and the **Spatially authored** predicate; it performs no I/O and imports no React.
- [x] Unit tests cover: empty recipe, single-**Section** recipe, two **Sections**, all three **Sections**, and a single-piece recipe. Prior art: `lib/spatial-fillings/__tests__/xray-layout.test.ts`.
- [x] The Configure templates list endpoint returns per-template **Section** coverage for `role = 'filling'` pillow templates.
- [x] Coverage is fetched in one grouped query for the whole list, not one query per template.
- [x] Bolster templates are never evaluated for **Spatially authored** and are never badged.
- [x] The list shows a badge on each template that is not **Spatially authored**, with copy naming the legacy flat recipe as the cause.
- [x] The badge is advisory: no control is disabled and no save is blocked.
- [x] The list shows a count of templates still needing authoring.
- [~] All ten default pillow **Filling Templates** are flagged in production data; the three bolster templates are not.
      Point-in-time production check, made when the slice landed and not re-verifiable
      from the repo. Superseded in any case by slice 07: the ten are now authored, so
      they no longer flag.
- [x] No **Placement** row is created, modified or deleted by this slice.
- [x] `./scripts/graphify update .` run and the refreshed graph committed alongside the code.

## Blocked by

- #110 (glossary — the badge copy uses **Spatially authored**)

