/**
 * Filling color override resolution (slice 11). Product Builder stores
 * per-subtype color overrides (filling_color_overrides); the x-ray renders
 * `fill: var(--xray-fill-<slug>, default)`, so applying an override is just
 * defining that CSS variable on the element containing the x-ray. Clearing a
 * row removes the variable and `var()` falls back to the code default.
 * Pure + browser-safe.
 */

import { fillingVisual, type ShapeId } from "./visuals";

export type ColorOverrideRow = { subtype: string; color: string };

export type EffectiveFillingColor = {
  subtype: string;
  shape: ShapeId;
  color: string;
  overridden: boolean;
};

/** Effective color per subtype: override row wins, else the code default. */
export function effectiveFillingColors(
  subtypes: string[],
  overrides: ColorOverrideRow[],
): EffectiveFillingColor[] {
  const bySubtype = new Map(overrides.map((o) => [o.subtype, o.color]));
  return subtypes.map((subtype) => {
    const visual = fillingVisual(subtype);
    const override = bySubtype.get(subtype);
    return {
      subtype,
      shape: visual.shape,
      color: override ?? visual.defaultColor,
      overridden: override !== undefined,
    };
  });
}

/**
 * CSS-variable style object (`--xray-fill-<slug>` → color) to spread onto the
 * x-ray container's `style`. Only overridden subtypes appear — absent
 * variables leave `var(x, default)` on the code default.
 */
export function xrayColorVarStyle(overrides: ColorOverrideRow[]): Record<string, string> {
  return Object.fromEntries(overrides.map((o) => [fillingVisual(o.subtype).cssVar, o.color]));
}
