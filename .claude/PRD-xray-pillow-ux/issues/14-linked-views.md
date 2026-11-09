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

## Round 2 (Ivan, 8-11-2026): precise by default, no keys, fluid Layers

> "I want precision to not need any pressing of buttons. It should come naturally on desktop and mobile … precise by default and also fluid in rearranging the fillings' layers."

- **No jump on pickup.** A held filling stays under the pointer at the point it was picked up, in both views. Before, the cut re-centred it on the pointer. What it is over is decided by its centre, so picking it up by an edge never changes where it goes:
  - the cut's column and Layer band;
  - the top view's cell (a layer row under the pointer still names that Layer).
- **Slowing down is the fine control** (`lib/dnd/fine-drag.ts`):
  - At an ordinary drag (200 px a second and up) the filling follows one to one.
  - Creeping (50 px a second and under), it moves 0.3 of the pointer's travel, so the last millimetre needs no key on a mouse or a finger.
  - Moving on draws it back under the pointer, so it never trails a normal drag.
  - Measured in Chromium on the Configure page: 12 px of creep moved a pouch 3 mm on the cut and 5 mm on the top view.
  - Speed is in screen pixels, so it feels the same on a phone and a desktop.
- **Snaps where a hand aims, only at a normal pace** (`snapAlongCentre`): home (un-nudged, which clears its offset), a column's middle, flush with a column's edge, and home across in the top view.
  - The pull reaches 7 screen px. It stands aside while creeping, so fine placement is never blocked.
  - Slowing on a snap creeps on from it rather than jumping off it.
  - The cut draws the snap's line; a phone buzzes once where it can.
- **The badge.** A pill over the held filling says where it lands, `40–191 mm · centred`. It sits above the finger on a phone, and shows where the filling stands when it has nowhere to go.
- **No Layer picker between drag and drop.** A filling dropped on a stacked cell in the top view lands on its top Layer with room, at its place in that row. Both views show it while it is held. Depth is changed on the cut by dragging up or down through the Layer bands, or on a layer row in the dive panel.
- **Fluid reflow.** While a filling is held, both views ease each preview's soft shapes over 130 ms (`HELD_EASE_MS`) instead of snapping, so the stack flows as it passes through the Layers. The release eases into the full settle.
- **The cut's ghost** is the filling's own size, light and dashed, so the solid landing reads through it.
- **The keys stay as a shortcut, never needed:** Alt + arrows (5 mm), Alt + Shift + arrows (1 mm).

Tests: `fine-drag.test.ts` (gain, no trailing at an ordinary pace, creep, catch-up, hold on a snap). `slab-drag.test.ts` (the snap places, home clears the offset, no snap places exactly). `pouch-drag.test.ts` (a stacked cell takes the drop on its top Layer). `xray-dive.check.ts`: one sunburst (the add picker), the fine drag and the centre's target. Browser: mouse at a normal pace then a creep on both views; down through the Layer bands on the cut; a drop on a stacked cell with no picker; a finger drag on a 390 px phone (no page scroll, the badge above the finger, the cut following).

## Round 3 (Ivan, 8-11-2026): a Neck support nudged to the centre stuck on the side

> "I know that the neck support component 'cannot' fit into the back of the pillow based on the measurements. I tried nudging the cervical neck component to the center, but it always gets stuck on the side."

- **The cause was the top view's soft settle, not the drag.** The back wall curves in across the centre Section. At Size S the back is about 69 mm deep at the middle and about 107 mm at the sides. A measured roll reaches that wall.
  - Each piece starts as its outline clipped to the walls. The wall clips a nudged roll more on its inner side, so the clipped outline's middle lies outward of where the roll was put.
  - The solver held the piece at that middle, and the curved wall then slid the firm roll on to a corner.
  - Drawn 25–35 view units past where it was put on either side of home; centred only at an offset of exactly 0. A hand creeping it toward the middle saw it stay in one corner, then jump to the other.
- **The fix:** a firm piece (the roll, the ear pad) is held across at the middle of its layout rect (`SoftPiece.anchorX`, `soft-top.ts`). It cannot squash to the wall as a pouch does, so the wall now pushes it front ↔ back. Pouches and the cut are unchanged.
- **Still true:** a roll that does not fit the centre back is drawn pressed forward into the pouch in front of it, and its cell keeps its **Fit status**.

Tests: `soft-top.test.ts` (a Neck support in a Size S centre back, nudged −40 … +40 mm, is drawn within 2 view units of where it was put, in order; fails on the old anchor by 35). Browser (preview fixture Hui Min Chua, Re-adjust): stored 40 mm right, it was drawn in the right corner; a drag toward the middle left it in the left corner, and a creep back did not move it. Now it is drawn where stored and follows the drag and the creep.

## Round 4 (Ivan, 9-11-2026): autosave, tap the cut to add, fine moves on the top view

> "When I'm editing … the fillings template or the customer's version, … autosave. So if I accidentally press back or exit or close the app or web, it should auto load … the last version I worked on. Also … tap on the side view for the front middle back section to add the sunburst menu to add the fillings. Then in the top view, I should also be able to do micro adjustments, just like … on the side view."

- **Autosave** (`lib/editor-drafts.ts`, `hooks/use-autosave-draft.ts`):
  - An edit that differs from what is saved is kept on this device (`localStorage`), 400 ms after the last change and at once when the page is hidden or left, or the dialog closes. Saving removes it; so does Discard.
  - **Customer › Re-adjust**: the page opens Re-adjust on a kept draft by itself, with "Picked up your unsaved re-adjustment from 7:04 pm" and Discard. Closed, the Pillow card offers Resume or Discard. A draft made on the pillow before it was changed (Change pillow, or a save elsewhere) is offered, not put back.
  - **Configure › Filling config**: the card opens on Filling config and the template last edited, with the edit put back. The template list marks templates with an unsaved edit; a new template's edit is kept too. Clear discards.
  - Per device and browser: it is never sent anywhere, and another device or Staff member does not see it.
- **Tap the cut to add** (`addAtSlabTarget`, `lib/dnd/slab-drag.ts`): a tap on a column of the side view (beside its pouches, above or under the stack, or on its Front / Middle / Back name) blooms the fillings there. The pick lands where the tap was, as a drop there would: above the stack a new top Layer, between Layers a new Layer there, an empty column its first piece, the name the add rule. A tap on a pouch still selects it. Undo in the toast.
- **Fine moves on the top view**: the top view's badge also says where the pouch stands across, which only the top view can set: `74–226 mm · 4 mm right`. (A per-view creep gain tried here made the two views feel different; round 5 replaced it.)

Tests: `editor-drafts.test.ts` (keep, read, expire, list by scope, a refusing store), `slab-drag.test.ts` (a tap adds as a drop there would; a full stack still takes it), `fine-drag.test.ts` (the creep gain by scale; a brisk hand still follows one to one and snaps). Browser (preview fixtures, phone and desktop): an edit in Re-adjust and in a Filling Template survives a reload and is put back; saving clears it; a stale draft is offered; a tap on Left › Front adds a 6D L there; a tap above the middle stack adds a new top Layer.

## Round 5 (Ivan, 9-11-2026): one hold for both views, and a mouse like a finger

> "Top view's fine drag and side view's fine drag feel different. I like the side view's version, please implement the exact same code for the same UX. And these must be the same for both cursor click drag and using from phone (I like the UX interaction from the phone, so best to have the same for desktop using mouse too)."

- **One hold, the side view's** (`components/spatial/held-pouch.tsx`): both `XrayPillow` and `XrayCrossSection` hold a filling with it, so every page that draws either view gets it. Neither keeps hold code of its own (`xray-dive.check.ts` says so).
  - The press-to-drag threshold, the fine drag (`stepHold`), the snap's reach and creeping on from a snap, and the buzz when a snap takes hold.
  - The ghost under the pointer: the filling's own shape, in its colour, light and dashed, so where it lands (drawn solid) reads through it. The badge rides over the ghost in both views (the top view's sat on the landed pouch). Both move by writing their transforms, never a re-render per pointer move.
  - The top view plans again only when where it would land can change (the target, the whole millimetre either way, whether a snap may pull), as the cut does; before, it settled the pillow and ran the fit on every pointer move. The release lands at the preview's own millimetres.
  - The top view draws the snap's line too: across the Section at the edge or middle it lined the pouch up with.
  - One creep gain in both views (FINE_GAIN). Round 4's per-view gain made the top view's held pouch lag the finger further than the cut's; that is gone.
- **A mouse like a finger** (`drawingScale`, `lib/dnd/fine-drag.ts`): speeds and the snap's reach are read against the drawing, in a phone's pixels. A desktop draws the pillow about twice a phone's size, so in raw screen pixels a mouse hardly ever crept and snapped at half the reach. The badge is 13 px on screen everywhere. A snap buzzes wherever the device can, whatever holds the filling (before, a touch on the cut, a phone-sized screen on the top view).

Measured (preview fixtures, Re-adjust): the same slow hand (20 steps over a phone's drawing, twice the pixels on a desktop's) moves the top view's 6D S from 81–233 mm to 69–221 mm with a finger on a 390 px phone and with a mouse at 1440 px. A brisk mouse drag across cells shows the drop and lands where it was shown.

Tests: `fine-drag.test.ts` (the drawing's scale; 100 px a second over a desktop's drawing creeps as 50 does on a phone), `xray-cross-section.test.tsx` (the shared ghost and its badge), `xray-dive.check.ts` (both views hold with `held-pouch.tsx` and keep no hold code of their own; the top view plans per millimetre).
