# 05: Cross-section view — a live across / along cut of the pillow beside every x-ray

Tracker: #205 · Parent: #200

**Type:** AFK
**Blocked by:** 03 (reads the fit result); 04 is not required
**User stories:** 23, 24, 25, 26, 27, 28, 29, 30
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:storefront`

## Goal

The question a side sleeper asks — are the sides higher than the middle? — is answered by a picture that updates as the mix changes, on every surface, including the shopper's read-only preview.

## The gap, precisely

- The x-ray is top-down only. Depth is an offset and a scrim (`packDepthStack`, `fillOpacity={Math.min(0.14 * p.depth, 0.5)}`).
- The completed shopper preview (`mp-config-client.tsx`, `guestXray`) shows the recommended mix as a top-down x-ray and a text reveal; loft is invisible.

## Scope

- **`components/spatial/xray-cross-section.tsx`** (new): pure SVG from `PillowFit`.
  - **Across** cut (default): left, center, right **Sections** at a chosen **sub-section** (front / middle / back; default middle). Shell drawn as a lens whose height is `maxLoftMm × k'`; each **Layer** a rounded slab of its compressed thickness, coloured by family through the same `--xray-fill-*` variables; compressed slabs hatched (an SVG `<pattern>`); an `over` stack drawn through the loft line in red; dashed loft line labelled in mm; each **Section**'s loft in mm beneath it.
  - **Along** cut: front, middle, back of the dived **Section** (center when nothing is dived). A small toggle Across | Along; sub-section tabs for Across.
  - A dashed cut line on the x-ray marks where the section is taken (rendered by `XrayPillow` from a `cutAt` prop), so the two views are linked.
  - No slab animation in v1 (`ponytail:` one CSS transition if wanted later).
- **Mounts:**
  - Configurator stage, under the pillow: Staff (full controls) and guest (Across only, no controls) whenever the x-ray is visible.
  - Configure card page and **Result** assign: beside the pack list, under the x-ray card.
  - Phone: between the x-ray and the dive dock, collapsed by default with a "Cross-section" disclosure.
- **Data flow:** the host computes `fitPillow` once (the same memo the x-ray uses) and passes it; the cross-section never recomputes.

## Acceptance criteria

- [ ] With a mix that stacks three layers in left and right and one in center, the Across cut at middle shows two tall stacks and one short one, with mm labels that equal `fitPillow`'s per-section loft.
- [ ] Switching the sub-section tab or Along changes the cut and the dashed cut line on the x-ray.
- [ ] A compressed layer is hatched; an `over` stack pokes above the dashed loft line in red.
- [ ] Adding, removing or moving a piece updates the cross-section with no extra interaction.
- [ ] The shopper preview shows the Across cut, read-only, with no toggle and no edit affordance.
- [ ] Configure and **Result** assign show it beside the pack list; `surface-parity.check.ts` asserts the mount on all three surfaces and the read-only variant on the preview.
- [ ] vitest: a pure `crossSectionSlabs(fit, cut)` returns slab heights that sum to each section's `loftMm` and never exceed `maxLoftMm` unless the status is `over`.
- [ ] `./scripts/graphify update .` run and committed.
