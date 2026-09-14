/**
 * Filling visual config map (ADR 0009 guardrail 5): filling subtype → fluid
 * shape + default color. Shape stays a code/designer concern; color renders
 * through a per-subtype CSS variable so Product Builder overrides (slice 11)
 * apply without a deploy. Pure + browser-safe.
 */

import { fillingFamily } from "./filling-groups";

// ponytail: one rounded-square pouch for every filling type — color + size
// carry the distinction; per-family designer fluid shapes slot back in here.
// A neck support is not a filling, so it reads as a pill.
export type ShapeId = "pouch" | "pill";

export type FillingVisual = {
  shape: ShapeId;
  /** Per-subtype CSS variable; renders as `var(cssVar, defaultColor)`. */
  cssVar: string;
  defaultColor: string;
};

/** One color per filling family — every size and variant of a family shares it. */
const FAMILY_COLORS: Record<string, string> = {
  "6d+": "#f59e0b",
  "6d": "#38bdf8",
  "3d": "#a78bfa",
  neck: "#34d399",
};

/**
 * Types outside the density families ("6F", "Latex") still get a color of
 * their own, picked by their first word so their variants match each other.
 * ponytail: 6 slots, so two unknown types can collide; name them a family color
 * above when that happens.
 */
const EXTRA_COLORS = ["#fb7185", "#a3e635", "#fb923c", "#2dd4bf", "#f472b6", "#e879f9"];

const FALLBACK_COLOR = "#94a3b8";

function familyColor(descriptor: string | null): string {
  const type = descriptor?.trim();
  if (!type) return FALLBACK_COLOR;
  const family = fillingFamily(type);
  if (family.key !== "other") return FAMILY_COLORS[family.key] ?? FALLBACK_COLOR;
  const word = type.toLowerCase().split(/[\s()-]+/)[0];
  let hash = 0;
  for (const ch of word) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return EXTRA_COLORS[hash % EXTRA_COLORS.length];
}

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

/** `subtype` is the item's type descriptor (see fillingDescriptor), not the raw column. */
export function fillingVisual(subtype: string | null): FillingVisual {
  return {
    shape: fillingFamily(subtype).key === "neck" ? "pill" : "pouch",
    cssVar: `--xray-fill-${subtypeSlug(subtype)}`,
    defaultColor: familyColor(subtype),
  };
}
