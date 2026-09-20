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
  - `PILLOW_DIMENSIONS[size]`: `widthMm`, `lengthMm`, `maxLoftMm`, optional `sectionWidthsMm: [left, center, right]`.
  - `POUCH_DIMENSIONS[key]`: `widthMm`, `lengthMm`, `thicknessMm`, `minThicknessMm`, `minWidthMm`, `orientation: "across" | "along"`. Key = `${family}/${variant-or-size}` from `fillingDescriptor` + `size`, lower-case, with one alias table (`fold` → `folded`, `l` from `"(L)"` and from `size: "L"` are the same key).
  - `NECK_SUPPORT_DIMENSIONS[size]` (XS, S, M, L) and `BOLSTER_DIMENSIONS[length]` (short, medium, long: `lengthMm`, `diameterMm`).
  - `resolveDims(item): { dims, source: "measured" | "fallback" }` — family default, then a generic pouch; never throws.
  - A `PLACEHOLDER_DIMENSIONS = true` flag while the numbers are typed in as placeholders. **The self-check fails while it is set**, so CI cannot merge placeholders as truth.
- **`lib/spatial-fillings/dimensions.check.ts`**: every descriptor the seeds and live inventory use resolves as `measured`; an unknown one resolves as `fallback`; the placeholder flag is off.
- **Product Visualize** (Settings → Products → Product Visualize, the filling colour table): a read-only **Dimensions** column, `180 × 120 × 45 mm`, or `— (fallback)` when unresolved. No editing.
- **`CONTEXT.md`**: **Product dimensions**, **Loft**, **Fit status**, **Cross-section view**, **Nudge**; amend **Filling visual** (scale from the registry).
- **`docs/adr/0019-physical-fit-model.md`** (0019 was the next free number at drafting; the open PayNow and Counter Payments PRDs also plan ADRs, so take the next free number when this lands): measurements in code (mm); fit derived on read, never persisted; pro-rata compression; advisory-not-blocking; DB-backed dimensions considered and rejected for v1, with the churn condition that reopens it.
- **Ivan:** fill the four intake tables in the PRD (pillow, pouches, Neck support, Mbolster). The slice records them with the date measured.

## Acceptance criteria

- [ ] `dimensions.ts` exports the four registries and `resolveDims`; every value is in millimetres and carries the measured date in a comment.
- [ ] vitest: `"6D (L)"`, `"6D L"` and `{ name: "6D Fold", size: "L" }` resolve to entries of the same family; `"3D (S)"`, `"6D+ (Folded)"`, `"6D (Round)"` and each **Neck support** size resolve `measured`; an unknown descriptor resolves `fallback` to its family default; a descriptor with no family resolves `fallback` to the generic pouch.
- [ ] `npx tsx lib/spatial-fillings/dimensions.check.ts` passes, and fails with a clear message when `PLACEHOLDER_DIMENSIONS` is true.
- [ ] Product Visualize shows the Dimensions column, with `(fallback)` on any unmeasured filling.
- [ ] `CONTEXT.md` carries the five new entries and the amended **Filling visual**; `docs/adr/0019-physical-fit-model.md` exists.
- [ ] Ivan's measurements are in the file and `PLACEHOLDER_DIMENSIONS` is false (the HITL half).
- [ ] `./scripts/graphify update .` run and committed with the change.
