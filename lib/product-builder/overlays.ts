import { z } from "zod/v4";

export const OverlayFitSchema = z.object({
  scale: z.number().min(0.2).max(3).optional(),
  x: z.number().min(-400).max(400).optional(),
  y: z.number().min(-400).max(400).optional(),
});

export type OverlayFit = z.infer<typeof OverlayFitSchema>;

const HEX_COLOR = /^#[0-9a-f]{6}$/;

export const OverlayColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Expected #rrggbb")
  .transform((s) => s.toLowerCase());

export function normalizeHexColor(input: string): string | null {
  let hex = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(hex)) hex = hex.replace(/./g, (c) => c + c);
  const color = `#${hex}`;
  return HEX_COLOR.test(color) ? color : null;
}

export type ItemOverlay =
  | { url: string; fit: OverlayFit | null; color?: undefined }
  | { color: string; url?: undefined; fit?: undefined };

export type OverlayMappingItem = {
  id: number;
  name: string;
  category: string;
  size: string | null;
  mapping: {
    media_asset_id: string | null;
    hosted_url: string | null;
    color: string | null;
    fit: OverlayFit | null;
  } | null;
};

export type OverlayState = "image" | "color" | "missing" | "none";

export function overlayState(mapping: OverlayMappingItem["mapping"]): OverlayState {
  if (!mapping) return "none";
  if (mapping.color) return "color";
  return mapping.hosted_url ? "image" : "missing";
}

export function overlayShips(item: OverlayMappingItem): boolean {
  const state = overlayState(item.mapping);
  return state === "image" || state === "color";
}

const SIZE_ORDER = ["XS", "S", "M", "L", "XL"];

function sizeRank(size: string | null): number {
  const i = SIZE_ORDER.indexOf(size?.trim().toUpperCase() ?? "");
  return i === -1 ? SIZE_ORDER.length : i;
}

export type OverlayFamily = {
  key: string;
  name: string;
  category: string;
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

export function overlaySignature(mapping: OverlayMappingItem["mapping"]): string {
  if (!mapping) return "none";
  if (mapping.color) return `color:${mapping.color}`;
  const fit = mapping.fit ?? {};
  return `image:${mapping.media_asset_id}:${fit.scale ?? 1}:${fit.x ?? 0}:${fit.y ?? 0}`;
}

export function overlaysDiffer(items: OverlayMappingItem[]): boolean {
  return new Set(items.map((i) => overlaySignature(i.mapping))).size > 1;
}

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
