/**
 * Dimension override resolution (X-ray pillow UX slice 12, ADR 0019). Settings
 * stores per-pouch and per-Neck-support rows (`filling_dimension_overrides`,
 * `neck_support_dimension_overrides`) and the loft allowance (a site setting);
 * this module folds them over the code registry in `dimensions.ts`: a row
 * wins, no row = the code value. Pillow geometry has no override and never
 * will — it is the drawing. Pure + browser-safe, like `color-overrides.ts`.
 */

import {
  CODE_REGISTRY,
  LOFT_ALLOWANCE,
  NECK_SUPPORT_FALLBACK,
  NECK_SUPPORT_SIZES,
  POUCH_FAMILY_FALLBACKS,
  GENERIC_POUCH,
  resolveDims,
  type DimensionItemLike,
  type DimensionRegistry,
  type Measured,
  type NeckSupportDimensions,
  type NeckSupportSize,
  type Orientation,
  type PouchDimensions,
  type ResolvedDims,
} from "./dimensions";

/** `site_settings.key` holding the allowance as a whole percentage, "10". */
export const LOFT_ALLOWANCE_SETTING_KEY = "xray_loft_allowance_pct";
export const LOFT_ALLOWANCE_MAX_PCT = 50;

export type DimensionOverrideRow = {
  key: string;
  width_mm: number;
  length_mm: number;
  thickness_mm: number;
  min_thickness_mm: number;
  min_width_mm: number;
  orientation: Orientation;
  flat_length_mm?: number | null;
  flat_width_mm?: number | null;
  updated_at?: string | null;
};

export type NeckSupportOverrideRow = {
  size: NeckSupportSize;
  width_mm: number;
  length_mm: number;
  thickness_mm: number;
  min_thickness_mm: number;
  updated_at?: string | null;
};

/**
 * The allowance from its stored text ("10" → 0.10). Absent, unparsable or
 * negative falls back to the code default; above the cap is clamped.
 */
export function loftAllowance(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return LOFT_ALLOWANCE;
  const pct = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(pct) || pct < 0) return LOFT_ALLOWANCE;
  return Math.min(pct, LOFT_ALLOWANCE_MAX_PCT) / 100;
}

/** The registry with Settings rows applied over the code defaults. */
export function effectiveRegistry(
  rows: readonly DimensionOverrideRow[],
  neckRows: readonly NeckSupportOverrideRow[],
  allowanceSetting: string | number | null | undefined,
): DimensionRegistry {
  const pouches: Record<string, Measured<PouchDimensions>> = { ...CODE_REGISTRY.pouches };
  const configured = new Set<string>();
  for (const r of rows) {
    pouches[r.key] = {
      widthMm: r.width_mm,
      lengthMm: r.length_mm,
      thicknessMm: r.thickness_mm,
      minThicknessMm: r.min_thickness_mm,
      minWidthMm: r.min_width_mm,
      orientation: r.orientation,
      ...(r.flat_length_mm ? { flatLengthMm: r.flat_length_mm } : {}),
      ...(r.flat_width_mm ? { flatWidthMm: r.flat_width_mm } : {}),
      measuredOn: r.updated_at ? r.updated_at.slice(0, 10) : "configured",
    };
    configured.add(r.key);
  }
  const neck: Partial<Record<NeckSupportSize, Measured<NeckSupportDimensions>>> = { ...CODE_REGISTRY.neck };
  for (const r of neckRows) {
    if (!(NECK_SUPPORT_SIZES as readonly string[]).includes(r.size)) continue;
    neck[r.size] = {
      widthMm: r.width_mm,
      lengthMm: r.length_mm,
      thicknessMm: r.thickness_mm,
      minThicknessMm: r.min_thickness_mm,
      measuredOn: r.updated_at ? r.updated_at.slice(0, 10) : "configured",
    };
    configured.add(`neck/${r.size.toLowerCase()}`);
  }
  return { pouches, neck, loftAllowance: loftAllowance(allowanceSetting), configured };
}

// --- The catalogue the Settings page lists ------------------------------------

export type CatalogSource = "default" | "configured" | "unmeasured";

export type PouchCatalogEntry = {
  key: string;
  label: string;
  dims: PouchDimensions;
  source: CatalogSource;
  /** Date measured (code) or last saved (Settings); null when unmeasured. */
  measuredOn: string | null;
};

export type NeckCatalogEntry = {
  size: NeckSupportSize;
  dims: NeckSupportDimensions;
  source: CatalogSource;
  measuredOn: string | null;
};

/** Every pouch the inventory carries, keyed as the registry keys it (the PRD intake rows). */
export const POUCH_CATALOG: readonly { key: string; label: string }[] = [
  { key: "3d/s", label: "3D (S)" },
  { key: "6d/s", label: "6D (S)" },
  { key: "6d/m", label: "6D (M)" },
  { key: "6d/l", label: "6D (L)" },
  { key: "6d/xl", label: "6D (XL)" },
  { key: "6d/round", label: "6D (Round)" },
  { key: "6d/folded/s", label: "6D Fold S" },
  { key: "6d/folded/m", label: "6D Fold M" },
  { key: "6d/folded/l", label: "6D Fold L" },
  { key: "6d+/s", label: "6D+ (S)" },
  { key: "6d+/l", label: "6D+ (L)" },
  { key: "6d+/folded", label: "6D+ (Folded)" },
];

function fallbackFor(key: string): Measured<PouchDimensions> {
  return POUCH_FAMILY_FALLBACKS[key.split("/")[0]] ?? GENERIC_POUCH;
}

/**
 * The rows the Settings page shows: the catalogue plus any live inventory key
 * not in it (so a new pouch is visible the day it is stocked), each with its
 * effective dimensions and where they came from.
 */
export function pouchCatalog(registry: DimensionRegistry, liveKeys: readonly string[] = []): PouchCatalogEntry[] {
  const known = new Set(POUCH_CATALOG.map((c) => c.key));
  const extras = [...new Set(liveKeys)]
    .filter((k) => !known.has(k) && !k.startsWith("neck/"))
    .sort()
    .map((key) => ({ key, label: key }));
  return [...POUCH_CATALOG, ...extras].map(({ key, label }) => {
    const entry = registry.pouches[key];
    if (entry) {
      const { measuredOn, ...dims } = entry;
      const source: CatalogSource = registry.configured?.has(key) ? "configured" : measuredOn ? "default" : "unmeasured";
      return { key, label, dims, source, measuredOn: source === "unmeasured" ? null : measuredOn };
    }
    const { measuredOn: _ignored, ...dims } = fallbackFor(key);
    void _ignored;
    return { key, label, dims, source: "unmeasured", measuredOn: null };
  });
}

export function neckCatalog(registry: DimensionRegistry): NeckCatalogEntry[] {
  return NECK_SUPPORT_SIZES.map((size) => {
    const entry = registry.neck[size];
    if (entry) {
      const { measuredOn, ...dims } = entry;
      const source: CatalogSource = registry.configured?.has(`neck/${size.toLowerCase()}`)
        ? "configured"
        : measuredOn
          ? "default"
          : "unmeasured";
      return { size, dims, source, measuredOn: source === "unmeasured" ? null : measuredOn };
    }
    const { measuredOn: _ignored, ...dims } = NECK_SUPPORT_FALLBACK;
    void _ignored;
    return { size, dims, source: "unmeasured", measuredOn: null };
  });
}

/** What `GET /settings/product-builder/dimensions` returns. */
export type DimensionsPayload = {
  pouches: PouchCatalogEntry[];
  neck: NeckCatalogEntry[];
  /** Whole percentage as stored, e.g. 10; `null` when the site setting is absent (code default). */
  loftAllowancePct: number | null;
  /** The effective allowance as a fraction, for the drawn-height hint. */
  loftAllowance: number;
};

// --- What a host receives and how it resolves items --------------------------

/**
 * The override rows a server route ships to an x-ray host, beside the colour
 * overrides it already ships (both tables are service-role only under RLS).
 */
export type DimensionOverridesPayload = {
  pouches: DimensionOverrideRow[];
  neck: NeckSupportOverrideRow[];
  /** The stored allowance setting, or null for the code default. */
  loftAllowance: string | null;
};

/** The registry a host draws with: the payload folded over the code defaults, or the code alone. */
export function registryFromPayload(payload: DimensionOverridesPayload | null | undefined): DimensionRegistry {
  if (!payload) return CODE_REGISTRY;
  return effectiveRegistry(payload.pouches ?? [], payload.neck ?? [], payload.loftAllowance ?? null);
}

/** item id → resolved dimensions for every item a host can place. */
export function resolveItemDims(
  items: readonly (DimensionItemLike & { id: number })[],
  registry: DimensionRegistry = CODE_REGISTRY,
): Map<number, ResolvedDims> {
  return new Map(items.map((item) => [item.id, resolveDims(item, registry)]));
}
