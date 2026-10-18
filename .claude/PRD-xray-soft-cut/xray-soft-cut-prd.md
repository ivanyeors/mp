# PRD: Soft cut — the cross-section as soft fillings in a cloth case, tuned in Settings

Status: Built on `claude/trusting-pasteur-h0iyxx`, awaiting Ivan's screenshot sign-off before PR
Source: Ivan's brief and review rounds (Oct 2026); a testing preview built against `main` @ `fbf5750`
(the codebase's fit model, cut model, `puffyPath` cushions and Center outline), checked against
the brand Type 8 / 8A / 9 / 9A / 11 diagrams
ADRs: **0025** (new: display physics for the cut), amends **0019** (soft-body still rejected for the
fit) and **0009** (guardrails hold for the cut); PRD `xray-pillow-ux` decision (d) amended
Glossary: `CONTEXT.md` — **Cross-section view**, **Soft cut** (new), **Layer**, **Insert order**,
**Loft**, **Fit status**, **Natural settle**, **Neck support**

## Problem Statement

The side view drew each filling as a rounded slab. In the real pillow:

1. Fillings are soft. They morph to fill the space they are given and press into each other and
   into the case.
2. They stack from the bottom up as they are added. Nothing floats in the middle.
3. The case is cloth. With little in it, it sags and does not stand to its full height; full, it
   takes the designed outline.

The slabs could do none of this. Worse, the fit's drape rule rests a pouch on the highest thing
under its span, counting **Layers** from the top, so a pouch could read as resting on a neighbour's
plank: floating.

## What the research and testing settled (do not lose these)

**Library survey.** matter.js, planck, box2d, p2, the PBD demos and soft-body SVG libraries were
all considered. Rigid bodies cannot morph. Spring-mesh soft bodies jitter, are not deterministic
when steps are split, and weigh 100 kB+. The verdict was a hand-written XPBD hybrid (Macklin, "Small
Steps"), many substeps of one iteration each, at about 500 lines. SVG, not canvas or WebGL.

**Gravity alone was not enough (spike).** Free-falling pouches slid, tilted, ballooned and crossed
over. What worked was "the fit decides where, the sim decides shape":

- Seed a gravity-first stack: Layers counted from the floor, one level at a time. Pieces of one
  level share support and never hold each other up. Over uneven support a piece drapes with a bend
  radius of 2.5 × its thickness; 0.9 × over-draped and self-crossed.
- Pre-squeeze over-full cells pro rata by compressible range, the fit's rule. Without this,
  three-high stacks exploded.
- Hold pieces loosely front ↔ back to where the fit put them (x tether 0.05; no y tether).

**The pouch model.**

| Element | How it works | Why |
|---|---|---|
| Fabric | Fixed-length (bilateral) edges | Unilateral edges let middle layers squeeze into wedges |
| Pressure | An area constraint toward the target volume. Compliance 0.008 is scaled by the target, so every pouch pushes alike. A hard floor holds the minimum area, and each move is capped by `maxStep` 1.2 | — |
| Surface tension | Laplacian skin | — |
| Shape memory | Area-normalised, rotation-free shape matching (β 0.85) toward the codebase's own cushion (`puffyPath`), rebuilt at the target volume | A rest shape at the seed size made pouches balloon into domes |
| Rest cushions in an over-full cell | Squeezed per cell | Otherwise pieces escaped through the back tip |
| Neck support | A stiff roll | — |

**The cloth case.** Bottom points pinned. Each element and its tested value:

| Element | Tested value | Notes |
|---|---|---|
| Edges | Unilateral, max length | May go slack |
| Pull toward a slumped copy of the sewn outline | 0.002 | 0.004 flattened full recipes |
| Laplacian detail toward the rest curvature | 0.12 | Below this, a void opened under the cloth in the app theme |
| i±2 bending | 0.25 | Fixes the back-tip notch |
| Signed-distance billow limit | 1.5 view units | Applied again after contacts, so a full stack cannot push the cloth past the seam |
| Empty-case slump | 0.38 of the sewn height | — |

**Contacts.**
- A uniform-grid edge hash (cell 12) with one sweep per point.
- Exact point-in-polygon checks for deep overlaps.
- A gap of 3.5 between pieces and a margin of 4 inside the case.
- Pushes are capped at 4 × `maxStep`.
- A piece in a cell that cannot close (`over`) may poke through the case.

**Smoothness ("no wobbly shapes").** Two changes, both measured with the wobble metric (bend-direction flips, plus RMS of the turning angle's second difference), averaged over every recipe and Size:
- Cloth i±2 bending in the solver.
- On output: even arc-length resample about every 5 view units, then a shrink-free Taubin low-pass (λ 0.5, μ −0.53), 8 passes. The case's flat bottom and corners are held fixed.

| | Pouch flips | Pouch roughness | Case flips | Case roughness |
|---|---|---|---|---|
| Before | 3.4 | 0.27 | 8.3 | 0.167 |
| After | about 1.3 | 0.043 | about 1.5 | 0.025 |
| Sewn outline (reference) | — | — | 2 | 0.040 |

Three approaches were tried and dropped for making outlines rougher: 56-point rings (more jitter), bending pouches toward their rest cushion (fights contact flats), and Taubin inside the solver loop (amplifies noise).

**Determinism and cost.**
- A fixed start, 24 steps × 5 substeps, no randomness and no trig in the loop.
- The result is identical however the steps are split.
- 15–45 ms per scene in headless Chromium.

**Port parity.** The repo port reproduced the preview to within 0.16 view units on all 30
recipe × Size scenes. It then added the after-contact seam hold, so a full stack sits up to about
5 units tighter at the back peak.

## Solution

### Display
`CrossSectionSvg` settles the fit's pieces in the cut's own frame and Center/side outline and
draws:
- each piece's soft outline;
- the cloth case, filled with the interior colour and stroked as the shell;
- the sewn outline faintly dashed behind the cloth;
- labels at each outline's pole of inaccessibility.

Everything else is unchanged and still reads the fit: hit-testing, keys, the drag ghost, loft
lines, column labels, Fit status colours, hatching and `over` red.

| Situation | What the cut does |
|---|---|
| A recipe changes | Settles in one go, then eases each outline from where it was (a new piece from its stacked start) to where it settles, about 0.4 s. Stepping the solver on screen showed pinched, half-solved shapes and was dropped |
| Reduced motion, drag previews, or "animate" off | Shows the settled shapes before paint |
| Static or server render | Draws the slabs |
| A recipe already seen | Comes from a 24-entry cache |

### Settings → Inventory → Configure → Soft body
| Control | Range | Default | Maps to |
|---|---|---|---|
| Soft cut on/off | — | on | off = rounded slabs |
| Rigidity | 0–100 | 50 | shape memory 0.01 + 0.06·r, skin 0.08 + 0.24·r |
| Pouch volume | 80–180 % | 130 % | target area = relaxed area × v |
| Empty case height | 20–70 % | 38 % | `slump` |
| Smoothing | 0–16 passes | 8 | Taubin passes |
| Space between pieces | 1–8 | 3.5 | `gap` (scaled with the cut) |
| Settle length | 8–48 steps | 24 | `steps` |
| Animate settle | — | on | never under reduced motion |

The page has a live preview built from the real `CrossSectionSvg` and the real fit:
- the six brand recipes (Type 8, 8A, 9, 9A, 11, Neck mix);
- Size XS–XL and the Left / Center / Right Section;
- a "compare with slabs" view;
- Replay.

It previews the unsaved draft as the sliders move. Save, Reset to defaults and the dirty state
follow the Dimensions tab.

### Storage and delivery
- **Storage:** one `site_settings` row, `xray_soft_body`, JSON. Anything missing or invalid parses
  to its default and out-of-range values clamp (`softBodySettings`).
- **Route:** `/settings/product-builder/soft-body`. GET, POST and DELETE, each guarded by
  `requireAdmin("configure")`, validated with zod against the ranges. Writes are audited
  (`xray.soft_body_update` / `reset`) and invalidate the `site-settings` tag.
- **Delivery:** the value rides `DimensionOverridesPayload.softBody`, so `loadDimensionOverrides`
  hands it to every x-ray host that already gets the loft allowance: Configure → Filling Template,
  Result detail, and `/mp-config` for both Staff assist and guests. Each host passes it as
  `softBody`.

## Build slices

| # | Slice | Files | Status |
|---|---|---|---|
| 01 | Solver: XPBD pouches, roll, cloth case, contacts, smoothing, label spot | `lib/spatial-fillings/soft-body.ts`, `__tests__/soft-body.test.ts` | built |
| 02 | Seeding: gravity-first stack, per-cell squeeze, empty-column spread, cache, `useSoftCut` | `components/spatial/soft-cut.ts`, `soft-cut.test.ts` | built |
| 03 | Drawing: soft outlines, cloth case, sewn ghost, labels, `softBody` / `softReplay` props | `components/spatial/xray-cross-section.tsx` | built |
| 04 | Settings model: knobs, ranges, defaults, parse, solver mapping | `lib/spatial-fillings/soft-body-settings.ts` + test | built |
| 05 | Storage and delivery: route, audit, payload, three hosts | `settings/product-builder/soft-body/route.ts`, `dimension-overrides*.ts`, hosts | built |
| 06 | Settings tab with live preview | `settings/inventory/configure/soft-body-section.tsx`, Configure tabs | built |
| 07 | Docs: ADR 0025, amendments, glossary | `docs/adr/`, `CONTEXT.md`, this PRD | built |

## Testing Decisions
**vitest:**
- the solver (determinism and split invariance, resting and volume, the roll, Taubin, the flat
  bottom, the label spot);
- the soft cut on every brand recipe × Size: nothing floats; Layer 0 is above the deeper Layers;
  pieces stay apart and inside the cloth; the cloth stays within its seam; under-filled sags and
  full stands; wobble stays under the measured bounds; every Section and the phone layout work;
  the time budget holds;
- the settings parse and mapping;
- the route guard by directory.

The existing static-markup tests of the cut still describe the first render, which is the slabs.

## Open decisions (Ivan)
1. **Count Layers from the floor in the fit's settle.** The soft cut spreads a pouch only into
   empty columns, where both counts agree. Changing the settle changes the fit's millimetres.
2. **Real pouch measurements.** The family fallbacks fill only 58–83 % of the case. "Pouch volume"
   × 1.30 covers the gap and should come down as rows are measured.
3. **Orientation.** The brand diagrams put the front on the right; the app puts it on the left.
4. **Brand diagram style** (flat brand colours, insert-order badges under the cut) as an option.
   The preview proved it; the app style ships.

## Out of Scope
- The Bolster cut, the top-down x-ray, and any change to the fit, settle, pack list or fingerprint.
- Hit-testing against the soft outlines; it still uses the fit's bands.
- A web worker. The settle is cheap enough on the main thread and is split across frames when it
  animates.
