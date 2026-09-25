# 01: Dimension registry, glossary and ADR 0019 — real pillow, pouch and Neck support measurements in code

Tracker: #201 · Parent: #200

**Type:** HITL — needs Ivan's measurements (the intake tables in the PRD's Further Notes); the code half is AFK
**Blocked by:** none
**User stories:** 5, 6, 7, 49
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:storefront`

## Goal

One pure module holds every physical measurement the x-ray needs, in millimetres, and every placeable **Item** resolves to one. Nothing else in this PRD can be honest without it.

## The gap, precisely

- `lib/spatial-fillings/visuals.ts:54` — `SIZE_SCALES = { XS: 0.7, S: 0.85, M: 1, L: 1.15, XL: 1.3 }` is the only size signal, and it is relative.
- No dimension column exists on `items`, `pillow_products` or the bolster tables, and none is wanted: the brief says code.
- Filling identity is a descriptor from `subtype` or `name` (`lib/spatial-fillings/filling-groups.ts` `fillingDescriptor`): `"3D (S)"`, `"6D (L)"`, `"6D Fold"` + `size`, `"6D+ (Folded)"`, `"6D (Round)"`. Live inventory leaves `subtype` null. Any registry key must go through the same normalisation or two rows will describe one pouch.
- **Neck support** is an Accessories **Item** matched by name (`NECK_SUPPORT` regex), sized XS–L.

## Scope

- **`lib/spatial-fillings/dimensions.ts`** (new, pure, browser-safe):
  - `PILLOW_DIMENSIONS[size]`: `widthMm`, `lengthMm`, `maxLoftMm`, `sectionWidthsMm: [left, center, right]` (the protector's divider seams, from `.claude/PRD-xray-pillow-ux/reference/protector-sections.json`: XS 204 / 195 / 204, S 203 / 240 / 203, M 223 / 260 / 223, L 251 / 260 / 251, XL equal thirds), plus `outline` = `SILHOUETTE_MASTER` (the traced M bottom panel, copied from `.claude/PRD-xray-pillow-ux/reference/silhouette-master.json`) scaled to `widthMm` × `lengthMm` — the M shape for every Size, no tab (Ivan, 25-9-2026; `reference/silhouette-<size>.json` holds each result for checking); `lengthMm` is the body length at the lobe line (306 / 330 / 330 / 350 / 365) — and `gusset` (`fullMm`, `tabEndMm`, `taperRunMm`, `backMm`, `dipRunMm`; the protector's gusset is the same height with no dip, so one `maxLoftMm` serves the side view and the fit budget). `LOFT_ALLOWANCE = 0.10` exported once; `maxLoftMm: [left, center, right] = [gusset.fullMm, gusset.backMm, gusset.fullMm] × (1 + LOFT_ALLOWANCE)` — the centre Section is one inch lower than the sides (*Mpillow Sizes Measurement.xlsx*, Drive 2020: side 4''–8'', centre 3''–7''; the case gusset's 25 mm centre-back drop agrees).
  - `POUCH_DIMENSIONS[key]`: `widthMm`, `lengthMm`, `thicknessMm`, `minThicknessMm`, `minWidthMm`, `orientation: "across" | "along"`. Key = `${family}/${variant-or-size}` from `fillingDescriptor` + `size`, lower-case, with one alias table (`fold` → `folded`, `l` from `"(L)"` and from `size: "L"` are the same key).
  - `NECK_SUPPORT_DIMENSIONS[size]` (XS, S, M, L) and `BOLSTER_DIMENSIONS[length]` (short, medium, long: `lengthMm`, `diameterMm`).
  - Optional per pouch: `flatLengthMm` / `flatWidthMm` (the fabric's limit when it stops a spread before the fill is fully compressed; derived from volume when absent). Optional per pillow Size: `subSectionDividers: boolean` (default false) — a physically walled product turns natural settle (slice 11) off. The 2018 protector drawings show walls between the three Sections only, so every pillow Size is `false`.
  - `resolveDims(item): { dims, source: "measured" | "fallback" }` — family default, then a generic pouch; never throws.
  - A `PLACEHOLDER_DIMENSIONS = true` flag while the numbers are typed in as placeholders. **The self-check fails while it is set**, so CI cannot merge placeholders as truth.
- **`lib/spatial-fillings/dimensions.check.ts`**: every descriptor the seeds and live inventory use resolves as `measured`; an unknown one resolves as `fallback`; the placeholder flag is off.
- **Product Visualize** (Settings → Products → Product Visualize, the filling colour table): a read-only **Dimensions** column, `180 × 120 × 45 mm`, or `— (fallback)` when unresolved. No editing.
- **`CONTEXT.md`**: **Product dimensions**, **Loft**, **Fit status**, **Cross-section view**, **Nudge**, **Natural settle** (with **Authored** / **Settled** as the two views of one recipe); amend **Filling visual** (scale from the registry).
- **`docs/adr/0019-physical-fit-model.md`** (0019 was the next free number at drafting; the open PayNow and Counter Payments PRDs also plan ADRs, so take the next free number when this lands): measurements in code (mm); fit derived on read, never persisted; pro-rata compression; advisory-not-blocking; DB-backed dimensions considered and rejected for v1, with the churn condition that reopens it.
- **Ivan:** the pillow table is filled from the 2018 case and protector drawings (PRD Further Notes, confirmed 22-9 and 25-9-2026); the pouch, Neck support and Mbolster tables are still his to fill. The slice records every value with the date measured.

## Acceptance criteria

- [ ] `dimensions.ts` exports the four registries and `resolveDims`; every value is in millimetres and carries the measured date in a comment.
- [ ] vitest: for every **Size**, `sectionWidthsMm` sums to `widthMm` (±1 mm) and equals `reference/protector-sections.json`; `maxLoftMm[0] === maxLoftMm[2]` and `maxLoftMm[1]` is 25 × (1 + `LOFT_ALLOWANCE`) mm lower; `outline`'s bounding box is `widthMm` × `lengthMm` (±0.5 mm), M's equals the master, and no vertex lies beyond `lengthMm` (no tab).
- [ ] vitest: `"6D (L)"`, `"6D L"` and `{ name: "6D Fold", size: "L" }` resolve to entries of the same family; `"3D (S)"`, `"6D+ (Folded)"`, `"6D (Round)"` and each **Neck support** size resolve `measured`; an unknown descriptor resolves `fallback` to its family default; a descriptor with no family resolves `fallback` to the generic pouch.
- [ ] `npx tsx lib/spatial-fillings/dimensions.check.ts` passes, and fails with a clear message when `PLACEHOLDER_DIMENSIONS` is true.
- [ ] Product Visualize shows the Dimensions column, with `(fallback)` on any unmeasured filling.
- [ ] `CONTEXT.md` carries the six new entries and the amended **Filling visual**; `docs/adr/0019-physical-fit-model.md` exists.
- [ ] Ivan's measurements are in the file and `PLACEHOLDER_DIMENSIONS` is false (the HITL half).
- [ ] `./scripts/graphify update .` run and committed with the change.
