# 14: Linked views — one position in both views, each following the other's drag live

Parent: #200

**Type:** AFK
**Blocked by:** 08 (offsets), 11 (the settle), 13 (editing on the cut)
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:storefront`
**Status:** built 7-11-2026 on `claude/xray-view-sync-audit-8acd6p`; driven in Chromium against the real Configure page on preview fixtures. Not yet seen on a deployed build.

## Goal

Ivan's brief (7-11-2026): arranging fillings should feel like stuffing a real pillow. The top view is where pouches are arranged side by side; the side view (the cut) is where they are stacked into Layers and placed precisely. The two must stay in sync, and a nudge in one view must show in the other immediately — while the pouch is still in hand, not only on release.

## What the audit found (before this slice)

- **Side view → top view was in sync**: the cut only writes offsets the settle draws the same way in both.
- **Top view → side view was not**, by 24–31 mm, in three cases:
  - a top-view drag or nudge into a neighbour cell occupied on the same Layer;
  - a stiff pouch (no fabric give) nudged into an empty neighbour;
  - every deeper Layer.
  The two views used different clamp rules. The top view let a pouch overhang anywhere in its Section (`packTrue`). The settle stopped a nudged pouch at its own columns (`extentIn`). The top view also shifted deeper Layers back by the depth foreshortening. The fit's loft followed the settle, so the top view was the one drawing the wrong place.
- **Neither view moved while the other was dragging.** The cut previewed only its target cell, not the millimetre, and the top view drew a ghost only.

## What it does

### One position, one writer

- **The settle owns front ↔ back.** `layoutPlacements` draws every pouch's settled extent from `settlePillow`'s `startMm` / `endMm`, the numbers the cut draws, through the stage's own rows. The authored rect (in the dive) is the pouch's own length where it was put, kept inside that extent.
- **Depth is drawn across only.** A deeper Layer sits a little to the right, darker; it no longer shifts along.
- **A placed pouch slides anywhere its Layer leaves free.** `settle.ts` gives each piece a reach (`reachFrom` / `reachTo`): its own column and the columns either side that hold nothing at its plane. A nudged pouch slides within it and stands in every column it covers. It never stands in a neighbour of its own Layer. A walled product keeps every pouch in its cell.
- **One writer for both views:** `placeAlongAt` (`lib/dnd/slab-drag.ts`).
  - It stands a pouch's settled extent at a millimetre, as far as there is room.
  - It solves the whole-mm offset against the settle itself, so the spread that follows a nudge never leaves the pouch off from where it was put.
  - Where many offsets draw the pouch alike, against a wall, it keeps the one nearest to what the pouch had.
  - When the pouch's centre ends in another, free column, it moves to that cell.
- **Who calls it:**
  - The cut's drop (`placeSlabDrop`) and Alt + ← / → (`nudgeSlab`).
  - The top view's drag (`placeTop`) and Alt + arrows.
- **Alt + Shift + arrows** step 1 mm in both views, for the last millimetre.

### Live in both views

- **The draft.** While a pouch is held in either view, that view publishes a draft (`components/spatial/xray-link.ts`): the Placements a release would commit, and their fit.
- **Keyed by the recipe.** The draft is keyed by the hosts' shared Placements array, so no host needed wiring and two recipes on one page never cross.
- **The top view** draws the draft, its own or the cut's, and outlines the held pouch. Its hit areas stay on the committed layout, so a held pouch never loses its pointer capture. The ghost is an outline, so it parts from the pouch where a wall or a neighbour stops it.
- **The cut** previews the placed drop to the millimetre as the pointer moves (`previewSlabDrop` with a centre). It follows the top view's drafts: it shows the Section the pouch is over (a pinned strip cut keeps its own) and says where it would land: `6D S · center front, layer 1 · 0–110 mm from the front`.
- **One plan, two uses.** The top view's release and its live preview are the same `planDrop`.

### Faster

- **Outlines** (`conformPouchPath`):
  - memoised per rect, regions and shape;
  - `simplifyRing`'s farthest pair found on the convex hull;
  - output byte-identical.
  - A Size M pillow: about 197 ms uncached before, 132 ms now, 0.15 ms when nothing moved.
- **Label rects and smoothed soft paths** are cached too, and an unchanged pouch outline no longer re-renders on a pointer move (`MorphPiece` memo).
- **While a pouch is in hand**, both views settle the soft body with `DRAFT_STEPS` (8) and never ease. The full settle eases in on release.

## Acceptance criteria

- [x] vitest `view-sync.test.ts`: for stored offsets from −80 to +80 mm, deeper Layers, and moves through the shared writer, every pouch's front and back edge is within 1.5 mm in both views. It fails against the old layout.
- [x] vitest `slab-drag.test.ts`: a pouch slides into the empty column beside it and stops at a neighbour of its own Layer; its centre in a free column moves it there (unless the drop chose the cell); no change where it stands; whole, bounded offsets.
- [x] vitest `conform.test.ts`: `farthestPair` equals the all-pairs scan on traced pouch outlines and 200 random rings with duplicates and collinear runs.
- [x] Layout, settle, soft-top, move-key tests re-derived for the across-only depth cue, the cell-edge inset and the 1 mm step.
- [x] `xray-dive.check.ts`: the live preview and the release share one plan.
- [x] Browser (preview fixtures, Configure › Premium M), on the side view and the top view:
  - a slide on the cut moves the pouch in the top view mid-drag;
  - a top-view drag into a free cell moves it on the cut mid-drag;
  - a dive drag is followed by the cut.
- [ ] Ivan on a deployed build, tablet and phone.
