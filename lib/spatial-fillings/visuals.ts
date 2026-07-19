/**
 * Filling visual config map (ADR 0009 guardrail 5): filling subtype → fluid
 * shape + default color. Shape stays a code/designer concern; color renders
 * through a per-subtype CSS variable so Product Builder overrides (slice 11)
 * apply without a deploy. Pure + browser-safe.
 */

export type ShapeId = "pouch3d" | "pouch6d" | "pouch6dPlus";

export type FillingVisual = {
  shape: ShapeId;
  /** Per-subtype CSS variable; renders as `var(cssVar, defaultColor)`. */
  cssVar: string;
  defaultColor: string;
};

/** Order matters: "6D+" must match before "6D". */
const FAMILY_DEFAULTS: Array<{ prefix: string; shape: ShapeId; color: string }> = [
  { prefix: "6D+", shape: "pouch6dPlus", color: "#f59e0b" },
  { prefix: "6D", shape: "pouch6d", color: "#38bdf8" },
  { prefix: "3D", shape: "pouch3d", color: "#a78bfa" },
];

const FALLBACK: { shape: ShapeId; color: string } = { shape: "pouch6d", color: "#94a3b8" };

/** CSS-safe slug for a subtype: "6D+ (Folded)" → "6d-plus-folded". */
export function subtypeSlug(subtype: string | null): string {
  if (!subtype) return "default";
  const slug = subtype
    .toLowerCase()
    .replaceAll("+", "-plus")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "default";
}

export function fillingVisual(subtype: string | null): FillingVisual {
  const family = subtype ? FAMILY_DEFAULTS.find((f) => subtype.startsWith(f.prefix)) : undefined;
  return {
    shape: family?.shape ?? FALLBACK.shape,
    cssVar: `--xray-fill-${subtypeSlug(subtype)}`,
    defaultColor: family?.color ?? FALLBACK.color,
  };
}
