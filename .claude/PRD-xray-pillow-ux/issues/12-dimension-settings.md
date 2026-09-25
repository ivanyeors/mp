# 12: Dimension settings — loft allowance, filling pouch and Neck support dimensions configurable in Settings

Tracker: #214 · Parent: #200

**Type:** AFK
**Blocked by:** 01 (the registry and `resolveDims`); build straight after it, before 03, so the fit reads configured values from day one
**User stories:** 63, 64, 65, 66
**Labels:** `enhancement`, `needs-triage`, `P1`, `area:admin`, `area:storefront`

## Goal

Ivan opens Settings, types a pouch's width, length and thickness, sets the loft allowance to 12 %, and every x-ray, side view and fit budget follows — no deploy, no PR. The shipped code values remain the defaults; a row in the database overrides one; Reset puts the default back. Pillow geometry (outlines, section widths, gusset heights) is not editable: it comes from the 2018 drawings and stays in code.

## The gap, precisely

- Slice 01 puts every measurement in code (PRD decision a). Ivan asked on 25-9-2026 for a place to configure the loft allowance, the filling pouch dimensions per size and the Cervical **Neck support** dimensions.
- The precedent already exists for colour: `filling_color_overrides` (row wins, no row = code default), `lib/spatial-fillings/color-overrides.ts` (`effectiveFillingColors`), the data route `app/[lang]/settings/product-builder/filling-visuals/route.ts` (`requireAdmin('page-builder')`, zod, upsert / delete) and the inline-edit table in `app/[lang]/settings/products/product-visualize.tsx`. Every x-ray host already loads that table (assist, recommend and shop customize routes; templates routes; Configure card page; **Result** detail; Mbolster).
- `site_settings` is the key/value store for site-wide numbers.

## Scope

- **Schema** (one additive migration; apply with `supabase db push`, never the MCP apply):
  - `filling_dimension_overrides`: `key text primary key` (the registry key, `family/variant-or-size`, e.g. `6d/l`), `width_mm`, `length_mm`, `thickness_mm`, `min_thickness_mm`, `min_width_mm` (integers > 0; checks `min_thickness_mm <= thickness_mm`, `min_width_mm <= width_mm`), `orientation text check (orientation in ('across','along'))`, `flat_length_mm` / `flat_width_mm` nullable, `created_at` / `updated_at` with `set_updated_at`, RLS service-role only — the same shape as `filling_color_overrides`.
  - `neck_support_dimension_overrides`: `size text primary key check (size in ('XS','S','M','L'))`, `width_mm`, `length_mm`, `thickness_mm`, `min_thickness_mm`, same checks, trigger and RLS.
  - Loft allowance: `site_settings` key `xray_loft_allowance_pct`, integer 0–50 stored as text; absent = the code default `LOFT_ALLOWANCE` (10 %).
- **`lib/spatial-fillings/dimension-overrides.ts`** (pure, browser-safe, mirrors `color-overrides.ts`): `DimensionOverrideRow`, `NeckSupportOverrideRow`; `effectiveDimensions(overrides, neckOverrides)` = code registry with rows applied (row wins); `resolveDims(item, effective)` now returns `source: "configured" | "measured" | "fallback"`; `loftAllowance(settingValue)` parses the setting, clamps to 0–0.5, defaults to `LOFT_ALLOWANCE`. Slice 01's `resolveDims(item)` keeps working with no overrides (empty rows).
- **Data route** `app/[lang]/settings/product-builder/dimensions/route.ts`: `GET` returns the registry merged with rows (one entry per key with `source`), the live inventory descriptors that have no entry at all (so an unmeasured pouch is visible), and the allowance; `POST` upserts one filling row, one Neck support row, or the allowance (zod: integers, the min ≤ relaxed rule, orientation enum, 0–50 %); `DELETE` resets one row. `requireAdmin('page-builder')` like the colour route.
- **UI — Product Visualize** (Settings → Products → Product Visualize) gains a **Dimensions** section under the filling colours:
  - *Loft allowance* — one percentage field, default 10, with the drawn side and centre heights per **Size** shown beside it as a hint (XS 111 / 84 … XL 223 / 196 at 10 %).
  - *Filling pouches* — one row per registry key (3D S; 6D S, M, L, XL; 6D Round; 6D Fold S/M/L; 6D+ S, L; 6D+ Folded), columns width, length, thickness, min thickness, min width, orientation, flat length, flat width, all in mm; inline edit saved on blur like the colour row; a chip *default* / *configured* / *unmeasured*; **Reset** per configured row. A live inventory descriptor with no entry appears as an *unmeasured* row that can be filled in.
  - *Neck support* — XS, S, M, L with width, length, thickness, min thickness; same behaviour.
  - Validation inline (mm integers, min ≤ relaxed); the pure resolver never sees a bad row because the route rejects it.
- **Plumbing:** every host that loads `filling_color_overrides` for the x-ray loads the two override tables and the allowance in the same query and passes `dimOverrides` beside `colorOverrides`; `itemDims` is derived with `resolveDims(item, effective)`; the fit and settle context carries `loftAllowance`. Guests read through the same shop routes (service-role RLS, as for colour). Slice 01's read-only Dimensions column becomes this section.
- **HITL shift:** the PRD intake tables stay the fastest way to seed the code defaults, but they no longer block: an entry Ivan has not provided renders as *unmeasured* on the page and as a hatched fallback pouch in the x-ray, and he can type it in when he has the ruler out. Slice 01's self-check keeps its structural assertions and drops the placeholder gate.
- **ADR 0019** records the split: pillow geometry in code from drawings; pouch, Neck support and allowance as code defaults with database overrides — the ADR 0009 colour pattern.

## Acceptance criteria

- [ ] Migration applied; a row with `min_thickness_mm > thickness_mm`, a non-positive value or an orientation outside the enum is rejected by the database.
- [ ] vitest: `effectiveDimensions` — a row wins over the code default and reports `configured`; a key with no row reports `measured`; an unknown key reports `fallback`; `loftAllowance(undefined)` is `0.10`, `"25"` is `0.25`, `"abc"`, `"-5"` and `"90"` fall back or clamp.
- [ ] Route: `GET` lists every registry key with its `source` and the allowance; `POST` rejects a bad row with 400 and upserts a good one; `DELETE` resets; all three refuse a non-admin.
- [ ] Product Visualize: editing a pouch width and blurring saves; reloading the Configure card page draws that pouch at the new footprint; **Reset** restores the default and the chip returns to *default*; a descriptor with no numbers shows *unmeasured*.
- [ ] Changing the allowance to 20 % changes the drawn side height on the side view and the loft budget the fit reports (slice 03), with no deploy.
- [ ] `surface-parity.check.ts` asserts every x-ray host passes `dimOverrides` wherever it passes `colorOverrides`.
- [ ] `./scripts/graphify update .` run and committed.
