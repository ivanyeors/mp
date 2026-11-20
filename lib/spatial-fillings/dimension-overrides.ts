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
  type PouchDimensions,
  type ResolvedDims,
} from "./dimensions";

export const LOFT_ALLOWANCE_SETTING_KEY = "xray_loft_allowance_pct";
export const LOFT_ALLOWANCE_MAX_PCT = 50;

export type DimensionOverrideRow = {
  key: string;
  width_mm: number;
  length_mm: number;
  thickness_mm: number;
  min_thickness_mm: number;
  min_width_mm: number;
  orientation: "across" | "along";
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

export function loftAllowance(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return LOFT_ALLOWANCE;
  const pct = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(pct) || pct < 0) return LOFT_ALLOWANCE;
  return Math.min(pct, LOFT_ALLOWANCE_MAX_PCT) / 100;
}

export function effectiveRegistry(
  rows: readonly DimensionOverrideRow[],
  neckRows: readonly NeckSupportOverrideRow[],
  allowanceSetting: string | number | null | undefined,
): DimensionRegistry {
  const pouches: Record<string, Measured<PouchDimensions>> = { ...CODE_REGISTRY.pouches };
  const configured = new Set<string>();
  for (const r of rows) {
    const along = r.orientation === "along";
    const flatLength = along ? r.flat_width_mm : r.flat_length_mm;
    const flatWidth = along ? r.flat_length_mm : r.flat_width_mm;
    pouches[r.key] = {
      widthMm: along ? r.length_mm : r.width_mm,
      lengthMm: along ? r.width_mm : r.length_mm,
      thicknessMm: r.thickness_mm,
      minThicknessMm: r.min_thickness_mm,
      minWidthMm: along ? Math.round((r.length_mm * Math.min(r.min_width_mm, r.width_mm)) / r.width_mm) : r.min_width_mm,
      ...(flatLength ? { flatLengthMm: flatLength } : {}),
      ...(flatWidth ? { flatWidthMm: flatWidth } : {}),
      measuredOn: r.updated_at ? r.updated_at.slice(0, 10) : "configured",
    };
    configured.add(r.key);
  }
  const neck: Partial<Record<NeckSupportSize, Measured<NeckSupportDimensions>>> = { ...CODE_REGISTRY.neck };
  for (const r of neckRows) {
    if (!(NECK_SUPPORT_SIZES as readonly string[]).includes(r.size)) continue;
    neck[r.size] = {
      lengthMm: r.width_mm,
      radiusMm: r.thickness_mm / 2,
      minRadiusMm: r.min_thickness_mm / 2,
      measuredOn: r.updated_at ? r.updated_at.slice(0, 10) : "configured",
    };
    configured.add(`neck/${r.size.toLowerCase()}`);
  }
  return { pouches, neck, loftAllowance: loftAllowance(allowanceSetting), configured };
}

export type CatalogSource = "default" | "configured" | "unmeasured";

export type PouchCatalogEntry = {
  key: string;
  label: string;
  dims: PouchDimensions;
  source: CatalogSource;
  measuredOn: string | null;
};

export type NeckCatalogEntry = {
  size: NeckSupportSize;
  dims: NeckSupportDimensions;
  source: CatalogSource;
  measuredOn: string | null;
};

export const POUCH_CATALOG: readonly { key: string; label: string }[] = [
  { key: "3d/s", label: "3D (S)" },
  { key: "6d/s", label: "6D (S)" },
  { key: "6d/m", label: "6D (M)" },
  { key: "6d/l", label: "6D (L)" },
  { key: "6d/xl", label: "6D (XL)" },
  { key: "6d/corner", label: "6D (Corner)" },
  { key: "6d/folded/s", label: "6D Fold S" },
  { key: "6d/folded/m", label: "6D Fold M" },
  { key: "6d/folded/l", label: "6D Fold L" },
  { key: "6d+/s", label: "6D+ (S)" },
  { key: "6d+/l", label: "6D+ (L)" },
  { key: "6d+/folded", label: "6D+ (Folded)" },
  { key: "ear/one-size", label: "Ear Comfort Pad" },
];

function fallbackFor(key: string): Measured<PouchDimensions> {
  return POUCH_FAMILY_FALLBACKS[key.split("/")[0]] ?? GENERIC_POUCH;
}

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

export type DimensionsPayload = {
  pouches: PouchCatalogEntry[];
  neck: NeckCatalogEntry[];
  loftAllowancePct: number | null;
  loftAllowance: number;
};

export type DimensionOverridesPayload = {
  pouches: DimensionOverrideRow[];
  neck: NeckSupportOverrideRow[];
  loftAllowance: string | null;
  softBody: string | null;
};

export function registryFromPayload(payload: DimensionOverridesPayload | null | undefined): DimensionRegistry {
  if (!payload) return CODE_REGISTRY;
  return effectiveRegistry(payload.pouches ?? [], payload.neck ?? [], payload.loftAllowance ?? null);
}

export function resolveItemDims(
  items: readonly (DimensionItemLike & { id: number })[],
  registry: DimensionRegistry = CODE_REGISTRY,
): Map<number, ResolvedDims> {
  return new Map(items.map((item) => [item.id, resolveDims(item, registry)]));
}
