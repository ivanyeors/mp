# Unified filling editor 05: embeddable x-ray frame + Configure page authors templates in the X-ray editor

Tracker: #114
Parent: PRD `unified-spatial-filling-editor` (`.claude/PRD-unified-spatial-filling-editor/unified-spatial-filling-editor-prd.md`)
Status: **Done — merged to main via PR #117 (91fc61ab) 2026-09-10.**
Criteria verified against the merged code, its unit tests and the `.check.ts`
self-checks, except where noted inline with `[~]`.

## Parent

#109 — PRD: Unified Spatial Filling Editor

## What to build

The slice that fixes the actual problem: **Filling Templates** are authored in the **X-ray editor**, in the one surface that can save to the catalog.

Today Settings → Inventory → Configure edits a spatial recipe through a 3×3 grid of dropdown lists. Nine boxes of `<select>` elements, no silhouette, no depth, no sense of the pillow being built. It is why every default template is left-packed and nobody noticed: the surface that saves gives no feedback about what it is saving.

**The frame.** `XrayPillow` renders an SVG at full width and height inside a `className`-only root, with an absolutely positioned dive overlay. It therefore needs a positioned ancestor with a definite height — which the configurator's full-bleed stage provides and an **Admin Panel** card does not. A small wrapper supplies a relatively positioned box at the x-ray's own aspect ratio, so it sits in normal document flow inside a card. `XrayPillow` itself is not modified: it already takes exactly the props this call site can supply, and already derives its read-only mode from the absence of filling items or a change handler.

**The swap.** The Configure page replaces the grid with the x-ray for pillow templates. It already loads filling items carrying name, subtype and size — structurally exactly what the component needs for its picker and its rendering — so this introduces no new fetching in the component. Colour overrides come from the route's read response (slice 04). The whole interaction comes across intact: click a **Section** to dive, add pieces from the radial picker, drag to reorder stack depth, remove from the chip on the pouch, five-piece **cell** cap refused with a visible message.

**What stays.** The derived pack list beside the editor, so COGS and what the build team picks are still checkable. The legacy-flat-recipe notice, which still explains that saving spatially will set **Placement** rows. **Mbolster** keeps its compartment list untouched — ADR 0008 is explicit that it has its own spatial schema and must not be forced into the pillow 3×3 metaphor.

**The warning.** The **Spatially authored** check from slice 02 also renders on the editor itself, not only in the list, so **Staff** see it in the surface where they can act on it. Advisory, never blocking.

The grid component is not deleted here — the **Result** detail assign editor still imports it. Slice 06 removes it.

Demoable outcome: open a pillow card in Configure, pick `M - basic - default`, see the eleven pouches stacked in the left third of a real pillow silhouette with a warning saying it was never authored, dive into center, add pieces, save, reload, and see them persist.

## Acceptance criteria

- [x] A wrapper mounts `XrayPillow` in normal document flow at its own aspect ratio, with a positioned ancestor and a definite height.
- [x] `XrayPillow` is reused without modification to its props or its read-only detection.
- [x] The Configure page renders the **X-ray editor** for pillow **Filling Templates** in place of the 3×3 grid.
- [x] Diving into a **Section**, the radial filling picker, drag-to-reorder stack depth and chip removal all work in the **Admin Panel**.
- [x] Pouch colours match the configurator, using the overrides from the route's read response.
- [x] Exceeding the five-piece **cell** cap is refused with a visible message, as in the configurator.
- [x] Saving persists **Placement** rows including stack depth, and a reload renders the same layout.
- [x] The derived pack list stays visible and still reflects a flatten of **Placement** rows, per ADR 0008.
- [x] The legacy-flat-recipe notice still renders for templates without placements.
- [x] The **Mbolster** compartment list is unchanged and never renders the pillow x-ray.
- [x] A template that is not **Spatially authored** shows the warning on the editor, advisory and non-blocking.
- [x] Placement writes still go through the admin route; the browser never writes placement tables directly.
- [~] The 3×3 grid component still exists and still works on the **Result** detail page.
      True when slice 05 landed. Slice 06 then deleted the grid by design, so this
      criterion is satisfied historically rather than in the current tree.
- [x] `npm run build` and the repo's type-check and test suites pass.
- [x] `./scripts/graphify update .` run and the refreshed graph committed alongside the code.

## Blocked by

- #111 (authoring-status module, for the editor warning)
- #113 (colour overrides in the read response, and the depth bound that lets stacks save)

