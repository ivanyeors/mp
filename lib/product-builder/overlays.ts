import { z } from "zod/v4";

/**
 * Product Builder (slice 10): cover/case Item → overlay mapping. An overlay is
 * either a Media Asset image or a solid color filling the silhouette.
 * Fit is an optional non-default placement for an image inside the silhouette
 * viewBox (664×374 for the pillow): uniform scale + x/y offsets in viewBox units.
 */
export const OverlayFitSchema = z.object({
  scale: z.number().min(0.2).max(3).optional(),
  x: z.number().min(-400).max(400).optional(),
  y: z.number().min(-400).max(400).optional(),
});

export type OverlayFit = z.infer<typeof OverlayFitSchema>;

const HEX_COLOR = /^#[0-9a-f]{6}$/;

/** A color overlay is stored as lowercase `#rrggbb`, matching the DB check. */
export const OverlayColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Expected #rrggbb")
  .transform((s) => s.toLowerCase());

/**
 * Lenient hex input → `#rrggbb`, or null when it is not a color. Accepts a
 * missing `#` and the 3-digit shorthand so a typed `fff` works.
 */
export function normalizeHexColor(input: string): string | null {
  let hex = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(hex)) hex = hex.replace(/./g, (c) => c + c);
  const color = `#${hex}`;
  return HEX_COLOR.test(color) ? color : null;
}

/**
 * Overlay payload riding along on configurator ComponentOptions: an image
 * placed by `fit`, or a solid color. Exactly one of `url` / `color` is set.
 */
export type ItemOverlay =
  | { url: string; fit: OverlayFit | null; color?: undefined }
  | { color: string; url?: undefined; fit?: undefined };

/**
 * An overlay-eligible cover/case Item with its current mapping. Lives here
 * rather than next to the Supabase read so the client workbench can import the
 * type without pulling `supabaseAdmin` into the bundle.
 */
export type OverlayMappingItem = {
  id: number;
  name: string;
  category: string;
  size: string | null;
  mapping: {
    /** Null for a color overlay. */
    media_asset_id: string | null;
    hosted_url: string | null;
    /** `#rrggbb` for a color overlay; null for an image. */
    color: string | null;
    fit: OverlayFit | null;
  } | null;
};

/**
 * What the configurator will actually draw for this mapping. `missing` is an
 * image mapping whose asset lost its hosted_url — fetchOverlayMap drops it, so
 * the shop shows the plain silhouette even though a row exists.
 */
export type OverlayState = "image" | "color" | "missing" | "none";

export function overlayState(mapping: OverlayMappingItem["mapping"]): OverlayState {
  if (!mapping) return "none";
  if (mapping.color) return "color";
  return mapping.hosted_url ? "image" : "missing";
}

/** True when the configurator renders an overlay for this item. */
export function overlayShips(item: OverlayMappingItem): boolean {
  const state = overlayState(item.mapping);
  return state === "image" || state === "color";
}

/** Sizes in wear order; anything else sorts after, alphabetically. */
const SIZE_ORDER = ["XS", "S", "M", "L", "XL"];

function sizeRank(size: string | null): number {
  const i = SIZE_ORDER.indexOf(size?.trim().toUpperCase() ?? "");
  return i === -1 ? SIZE_ORDER.length : i;
}

/**
 * Items sharing a (category, name) — the same grouping a Listed storefront
 * product uses (sizes become variants), so "Fibrecool" XS–L is one family.
 */
export type OverlayFamily = {
  key: string;
  name: string;
  category: string;
  /** Size-ordered (XS → XL). */
  items: OverlayMappingItem[];
};

export function overlayFamilies(items: OverlayMappingItem[]): OverlayFamily[] {
  const byKey = new Map<string, OverlayFamily>();
  for (const item of items) {
    const key = `${item.category}:${item.name}`;
    let family = byKey.get(key);
    if (!family) {
      family = { key, name: item.name, category: item.category, items: [] };
      byKey.set(key, family);
    }
    family.items.push(item);
  }
  for (const family of byKey.values()) {
    family.items.sort(
      (a, b) =>
        sizeRank(a.size) - sizeRank(b.size) || (a.size ?? "").localeCompare(b.size ?? ""),
    );
  }
  return [...byKey.values()];
}

/**
 * Identity of a saved overlay, for telling whether several sizes show the same
 * thing. An identity fit and no fit are the same placement.
 */
export function overlaySignature(mapping: OverlayMappingItem["mapping"]): string {
  if (!mapping) return "none";
  if (mapping.color) return `color:${mapping.color}`;
  const fit = mapping.fit ?? {};
  return `image:${mapping.media_asset_id}:${fit.scale ?? 1}:${fit.x ?? 0}:${fit.y ?? 0}`;
}

/** True when the items do not all carry the same overlay. */
export function overlaysDiffer(items: OverlayMappingItem[]): boolean {
  return new Set(items.map((i) => overlaySignature(i.mapping))).size > 1;
}

/**
 * SVG <image> frame for an overlay inside the silhouette viewBox.
 * No fit (or identity fit) fills the whole viewBox, centered.
 */
export function overlayFrame(
  fit: OverlayFit | null | undefined,
  viewW = 664,
  viewH = 374,
): { x: number; y: number; width: number; height: number } {
  const scale = fit?.scale ?? 1;
  const width = viewW * scale;
  const height = viewH * scale;
  return {
    x: (viewW - width) / 2 + (fit?.x ?? 0),
    y: (viewH - height) / 2 + (fit?.y ?? 0),
    width,
    height,
  };
}
