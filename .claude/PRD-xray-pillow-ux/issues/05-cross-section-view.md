# 05: Cross-section view — a live across / along cut of the pillow beside every x-ray

Tracker: #205 · Parent: #200

**Type:** AFK
**Blocked by:** 03 (reads the fit result), 11 (settled thickness per column); 04 is not required
**User stories:** 23, 24, 25, 26, 27, 28, 29, 30
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:storefront`
**Status:** built (PR #213) — `lib/spatial-fillings/cross-section.ts` (pure slab model), `components/spatial/xray-cross-section.tsx` (SVG, controls, phone disclosure, `useCut`), `cutAt` line on the x-ray, mounted on all three surfaces; the fit exposes each column's planes.

## Goal

The question a side sleeper asks — are the sides higher than the middle? — is answered by a picture that updates as the mix changes, on every surface, including the shopper's read-only preview.

## The gap, precisely

- The x-ray is top-down only. Depth is an offset and a scrim (`packDepthStack`, `fillOpacity={Math.min(0.14 * p.depth, 0.5)}`).
- The completed shopper preview (`mp-config-client.tsx`, `guestXray`) shows the recommended mix as a top-down x-ray and a text reveal; loft is invisible.

## Scope

- **`components/spatial/xray-cross-section.tsx`** (new): pure SVG from `PillowFit`.
  - **Across** cut (default): left, center, right **Sections** at a chosen **sub-section** (front / middle / back; default middle). Shell drawn as three lenses whose heights are `maxLoftMm[section] × k'` (the centre lens is one inch lower); each **Layer** a rounded slab of its compressed thickness, coloured by family through the same `--xray-fill-*` variables; compressed slabs hatched (an SVG `<pattern>`); an `over` stack drawn through the loft line in red; dashed loft line labelled in mm; each **Section**'s loft in mm beneath it.
  - **Along** cut: front, middle, back of the dived **Section** (center when nothing is dived). A small toggle Across | Along; sub-section tabs for Across.
  - ~~A dashed cut line on the x-ray marks where the section is taken~~ *Removed 26-9-2026 (Ivan: no dotted seams on the pillow):* the x-ray draws no cut line; the cross-section's own controls say where it is taken, and an along cut still follows the dive.
  - No slab animation in v1 (`ponytail:` one CSS transition if wanted later).
- **Mounts:**
  - Configurator stage, under the pillow: Staff (full controls) and guest (Across only, no controls) whenever the x-ray is visible.
  - Configure card page and **Result** assign: beside the pack list, under the x-ray card.
  - Phone: between the x-ray and the dive dock, collapsed by default with a "Cross-section" disclosure.
- **Data flow:** the host computes `fitPillow` once (the same memo the x-ray uses) and passes it; the cross-section never recomputes.

## Acceptance criteria

- [x] With a mix that stacks three layers in left and right and one in center, the Across cut at middle shows two tall stacks and one short one, with mm labels that equal `fitPillow`'s per-section loft (vitest on the slab model).
- [x] Switching the sub-section tab or Along changes the cut (one `useCut` per host; an Along cut follows the dive through `onDiveChange`). *26-9-2026:* the dashed cut line on the x-ray was removed with the other lines on the pillow.
- [x] A pouch that settled across middle and back contributes its settled thickness to both columns: the spill case shows two lower columns, not one tall one and a gap (vitest, along cut; the walled control shows the gap).
- [x] A compressed layer is hatched; an `over` stack pokes above the dashed loft line in red (slab `hatched` / `status` in the model; SVG `<pattern>` and red tint in the component).
- [x] Adding, removing or moving a piece updates the cross-section with no extra interaction: it renders from the host's fit memo, which changes with the Placements.
- [x] The shopper preview shows the Across cut, read-only, with no toggle and no edit affordance (`onCutChange` omitted for guests; self-check).
- [x] Configure and **Result** assign show it under the x-ray, beside the pack list column; `surface-parity.check.ts` asserts the mount on all three surfaces, the shared cut, and the read-only variant on the preview.
- [x] vitest: a pure `crossSectionSlabs(fit, cut)` returns slab heights that sum to each section's `loftMm` and never exceed `maxLoftMm[section]` unless the status is `over`.
- [x] `./scripts/graphify update .` run and committed.

## Build notes (2026-09-25)

- **The fit carries the columns.** `SectionFit.columns[subSection]` is each sub-section column's settled stack (`ColumnFit`: planes with drawn thickness, ratio, status and the item that sets the plane); `loftBySubSection` is Σ of those planes. `crossSectionSlabs` only reshapes that per cut, so the cross-section can never disagree with the x-ray's rings and gauges.
- **Cut state lives in the host** (`useCut`): the cross-section's controls set it, the x-ray draws it (`cutAt`), and an Along cut follows the dived Section through `onDiveChange`. The guest preview gets the Across cut at middle with no controls.
- **Drawing.** One vertical scale per drawing with 12 % headroom, so an `over` stack still fits above its loft line; columns as wide as their Section (across) or one cell (along); a flat-bottomed lens per column at that column's max loft; slabs as rounded paths, deepest at the bottom; `max N mm` on the loft line, the column's loft under it. Colours come through the same `--xray-fill-*` variables as the pouches, so Product Builder overrides apply.
- **Theme.** `xray-theme.ts` holds the light/dark shell variables the editor frame used to keep privately; the cross-section shares them on the Admin pages and keeps the dark defaults on the configurator stage.
- **Mbolster** has no cross-section yet (slice 09: an end-on cut).
