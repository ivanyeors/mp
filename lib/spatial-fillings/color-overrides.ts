import { fillingVisual, type ShapeId } from "./visuals";

export type ColorOverrideRow = { subtype: string; color: string };

export type EffectiveFillingColor = {
  subtype: string;
  shape: ShapeId;
  color: string;
  overridden: boolean;
};

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

export function xrayColorVarStyle(overrides: ColorOverrideRow[]): Record<string, string> {
  return Object.fromEntries(overrides.map((o) => [fillingVisual(o.subtype).cssVar, o.color]));
}
