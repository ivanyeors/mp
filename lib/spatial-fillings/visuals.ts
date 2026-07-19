/**
 * Filling visual config map (ADR 0009 guardrail 5): filling subtype → fluid
 * shape + default color. Shape stays a code/designer concern; color renders
 * through a per-subtype CSS variable so Product Builder overrides (slice 11)
 * apply without a deploy. Pure + browser-safe.
 */

// ponytail: one rounded-square pouch for every filling type — color + size
// carry the distinction; per-family designer fluid shapes slot back in here.
export type ShapeId = "pouch";

export type FillingVisual = {
  shape: ShapeId;
  /** Per-subtype CSS variable; renders as `var(cssVar, defaultColor)`. */
  cssVar: string;
  defaultColor: string;
};

/** Order matters: "6D+" must match before "6D". */
const FAMILY_DEFAULTS: Array<{ prefix: string; color: string }> = [
  { prefix: "6D+", color: "#f59e0b" },
  { prefix: "6D", color: "#38bdf8" },
  { prefix: "3D", color: "#a78bfa" },
];

const FALLBACK_COLOR = "#94a3b8";

/** Pouch render scale per Item size (items.size); unknown/null sizes render at 1. */
const SIZE_SCALES: Record<string, number> = { XS: 0.7, S: 0.85, M: 1, L: 1.15, XL: 1.3 };

export function sizeScale(size: string | null | undefined): number {
  return SIZE_SCALES[size?.toUpperCase() ?? ""] ?? 1;
}

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
    shape: "pouch",
    cssVar: `--xray-fill-${subtypeSlug(subtype)}`,
    defaultColor: family?.color ?? FALLBACK_COLOR,
  };
}
