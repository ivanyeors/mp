import { EAR_PAD, fillingDescriptor, fillingFamily, NECK_SUPPORT } from "./filling-groups";
import {
  SILHOUETTE_MASTER,
  SILHOUETTE_MASTER_LENGTH_MM,
  SILHOUETTE_MASTER_WIDTH_MM,
} from "./silhouette-master";
import type { BolsterLength } from "./xray-layout";

export type PillowSize = "XS" | "S" | "M" | "L" | "XL";
export const PILLOW_SIZES: readonly PillowSize[] = ["XS", "S", "M", "L", "XL"];

export const LOFT_ALLOWANCE = 0.1;

export const SEAM_MM = 2;

export type PointMm = readonly [number, number];

export type Gusset = {
  fullMm: number;
  tabEndMm: number;
  taperRunMm: number;
  backMm: number;
  dipRunMm: number;
};

export type PerSection<T> = readonly [T, T, T];

export type PillowDimensions = {
  size: PillowSize;
  widthMm: number;
  lengthMm: number;
  sectionWidthsMm: PerSection<number>;
  gusset: Gusset;
  maxLoftMm: PerSection<number>;
  outline: readonly PointMm[];
  subSectionDividers: boolean;
};

export function maxLoftMm(gusset: Gusset, allowance: number = LOFT_ALLOWANCE): PerSection<number> {
  const k = 1 + allowance;
  const side = round1(gusset.fullMm * k);
  return [side, round1(gusset.backMm * k), side];
}

export function scaledOutline(widthMm: number, lengthMm: number): readonly PointMm[] {
  const sx = widthMm / SILHOUETTE_MASTER_WIDTH_MM;
  const sy = lengthMm / SILHOUETTE_MASTER_LENGTH_MM;
  return SILHOUETTE_MASTER.map(([x, y]) => [round2(x * sx), round2(y * sy)] as const);
}

type PillowSpec = Omit<PillowDimensions, "maxLoftMm" | "outline" | "subSectionDividers">;

const PILLOW_SPECS: readonly PillowSpec[] = [
  {
    size: "XS",
    widthMm: 604,
    lengthMm: 306,
    sectionWidthsMm: [204, 195, 204],
    gusset: { fullMm: 101, tabEndMm: 20, taperRunMm: 147, backMm: 76, dipRunMm: 109 },
  },
  {
    size: "S",
    widthMm: 647,
    lengthMm: 330,
    sectionWidthsMm: [203, 240, 203],
    gusset: { fullMm: 127, tabEndMm: 20, taperRunMm: 144, backMm: 102, dipRunMm: 122 },
  },
  {
    size: "M",
    widthMm: 706,
    lengthMm: 330,
    sectionWidthsMm: [223, 260, 223],
    gusset: { fullMm: 153, tabEndMm: 20, taperRunMm: 172, backMm: 128, dipRunMm: 132 },
  },
  {
    size: "L",
    widthMm: 762,
    lengthMm: 350,
    sectionWidthsMm: [251, 260, 251],
    gusset: { fullMm: 178, tabEndMm: 20, taperRunMm: 201, backMm: 153, dipRunMm: 132 },
  },
  {
    size: "XL",
    widthMm: 836,
    lengthMm: 365,
    sectionWidthsMm: [279, 278, 279],
    gusset: { fullMm: 203, tabEndMm: 20, taperRunMm: 228, backMm: 178, dipRunMm: 156 },
  },
];

export const PILLOW_DIMENSIONS: Readonly<Record<PillowSize, PillowDimensions>> = Object.fromEntries(
  PILLOW_SPECS.map((spec) => [
    spec.size,
    {
      ...spec,
      maxLoftMm: maxLoftMm(spec.gusset),
      outline: scaledOutline(spec.widthMm, spec.lengthMm),
      subSectionDividers: false,
    } satisfies PillowDimensions,
  ]),
) as Record<PillowSize, PillowDimensions>;

export const REFERENCE_SIZE: PillowSize = "M";

export type SizeFactors = {
  across: number;
  along: number;
  thickness: number;
};

export function sizeFactors(pillow: Pick<PillowDimensions, "widthMm" | "lengthMm" | "gusset">): SizeFactors {
  const ref = PILLOW_DIMENSIONS[REFERENCE_SIZE];
  return {
    across: pillow.widthMm / ref.widthMm,
    along: pillow.lengthMm / ref.lengthMm,
    thickness: pillow.gusset.fullMm / ref.gusset.fullMm,
  };
}

export function pouchAtSize(d: PouchDimensions, f: SizeFactors): PouchDimensions {
  if (f.across === 1 && f.along === 1 && f.thickness === 1) return d;
  const wf = f.across;
  const lf = f.along;
  return {
    ...d,
    widthMm: round1(d.widthMm * wf),
    minWidthMm: round1(d.minWidthMm * wf),
    lengthMm: round1(d.lengthMm * lf),
    thicknessMm: round1(d.thicknessMm * f.thickness),
    minThicknessMm: round1(d.minThicknessMm * f.thickness),
    ...(d.flatWidthMm === undefined ? {} : { flatWidthMm: round1(d.flatWidthMm * wf) }),
    ...(d.flatLengthMm === undefined ? {} : { flatLengthMm: round1(d.flatLengthMm * lf) }),
  };
}

export function dimsAtSize(
  dims: ReadonlyMap<number, ResolvedDims> | undefined,
  pillow: Pick<PillowDimensions, "widthMm" | "lengthMm" | "gusset">,
): (itemId: number) => PouchDimensions {
  const f = sizeFactors(pillow);
  const memo = new Map<number, PouchDimensions>();
  return (itemId) => {
    let d = memo.get(itemId);
    if (!d) {
      d = pouchAtSize(dims?.get(itemId)?.dims ?? GENERIC_POUCH, f);
      memo.set(itemId, d);
    }
    return d;
  };
}

export function isPillowSize(value: string | null | undefined): value is PillowSize {
  return (PILLOW_SIZES as readonly string[]).includes(String(value ?? "").toUpperCase());
}

export function pillowDimensions(size: string | null | undefined): {
  dims: PillowDimensions;
  assumed: boolean;
} {
  const key = String(size ?? "").toUpperCase();
  return isPillowSize(key)
    ? { dims: PILLOW_DIMENSIONS[key], assumed: false }
    : { dims: PILLOW_DIMENSIONS.M, assumed: true };
}

export type PouchDimensions = {
  widthMm: number;
  lengthMm: number;
  thicknessMm: number;
  minThicknessMm: number;
  minWidthMm: number;
  flatLengthMm?: number;
  flatWidthMm?: number;
};

export type NeckSupportSize = "XS" | "S" | "M" | "L";
export const NECK_SUPPORT_SIZES: readonly NeckSupportSize[] = ["XS", "S", "M", "L"];

export type NeckSupportDimensions = {
  lengthMm: number;
  radiusMm: number;
  minRadiusMm: number;
};

export function neckAsPouch(n: NeckSupportDimensions): PouchDimensions {
  return {
    widthMm: n.lengthMm,
    lengthMm: 2 * n.radiusMm,
    thicknessMm: 2 * n.radiusMm,
    minThicknessMm: 2 * n.minRadiusMm,
    minWidthMm: n.lengthMm,
  };
}

export type BolsterDimensions = { lengthMm: number; diameterMm: number };

export type Measured<T> = T & { measuredOn: string | null };

export const POUCH_DIMENSIONS: Readonly<Record<string, Measured<PouchDimensions>>> = {};

export const POUCH_FAMILY_FALLBACKS: Readonly<Record<string, Measured<PouchDimensions>>> = {
  "3d": {
    widthMm: 170,
    lengthMm: 130,
    thicknessMm: 35,
    minThicknessMm: 20,
    minWidthMm: 140,
    measuredOn: null,
  },
  "6d": {
    widthMm: 190,
    lengthMm: 140,
    thicknessMm: 45,
    minThicknessMm: 25,
    minWidthMm: 160,
    measuredOn: null,
  },
  "6d+": {
    widthMm: 200,
    lengthMm: 150,
    thicknessMm: 55,
    minThicknessMm: 30,
    minWidthMm: 170,
    measuredOn: null,
  },
  ear: {
    widthMm: 180,
    lengthMm: 180,
    thicknessMm: 40,
    minThicknessMm: 18,
    minWidthMm: 170,
    measuredOn: null,
  },
};

export const GENERIC_POUCH: Measured<PouchDimensions> = {
  widthMm: 180,
  lengthMm: 140,
  thicknessMm: 45,
  minThicknessMm: 25,
  minWidthMm: 150,
  measuredOn: null,
};

export const NECK_SUPPORT_DIMENSIONS: Readonly<
  Partial<Record<NeckSupportSize, Measured<NeckSupportDimensions>>>
> = {};

export const NECK_SUPPORT_FALLBACK: Measured<NeckSupportDimensions> = {
  lengthMm: 300,
  radiusMm: 25,
  minRadiusMm: 15,
  measuredOn: null,
};

export const BOLSTER_DIMENSIONS: Readonly<Record<BolsterLength, Measured<BolsterDimensions>>> = {
  short: { lengthMm: 600, diameterMm: 180, measuredOn: null },
  medium: { lengthMm: 900, diameterMm: 200, measuredOn: null },
  long: { lengthMm: 1200, diameterMm: 200, measuredOn: null },
};

export const PLACEHOLDER_DIMENSIONS = false;

export type ResolvedSource = "configured" | "measured" | "fallback";

export type ResolvedDims = {
  key: string;
  kind: "pouch" | "neck";
  dims: PouchDimensions;
  source: ResolvedSource;
  measuredOn: string | null;
};

const DENSITY = /^\s*(\d+D)(\+)?/i;
const SIZE_TOKENS = new Set(["xs", "s", "m", "l", "xl"]);
const VARIANT_ALIASES: Readonly<Record<string, string>> = { fold: "folded" };

function normaliseVariant(descriptor: string): string {
  const paren = descriptor.match(/\(([^)]+)\)/)?.[1];
  const raw = (paren ?? descriptor.replace(DENSITY, "").replace(/^[\s\-+]+/, ""))
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, "-");
  return VARIANT_ALIASES[raw] ?? raw;
}

export type DimensionItemLike = {
  name: string;
  subtype?: string | null;
  size?: string | null;
  category?: string | null;
};

export const EAR_PAD_KEY = "ear/one-size";

export function pouchKey(item: DimensionItemLike): string {
  const descriptor = fillingDescriptor({ name: item.name, subtype: item.subtype ?? null });
  const size = (item.size ?? "").trim().toLowerCase();
  if (NECK_SUPPORT.test(descriptor) || NECK_SUPPORT.test(item.name)) {
    return `neck/${size || "m"}`;
  }
  if (EAR_PAD.test(descriptor) || EAR_PAD.test(item.name)) {
    return size && size !== "-" ? `ear/${size}` : EAR_PAD_KEY;
  }
  const family = fillingFamily(descriptor).key;
  const variant = normaliseVariant(descriptor);
  if (family === "other") return `other/${variant || "unknown"}`;
  if (!variant || SIZE_TOKENS.has(variant)) return `${family}/${variant || size || "unsized"}`;
  return size ? `${family}/${variant}/${size}` : `${family}/${variant}`;
}

export type DimensionRegistry = {
  pouches: Readonly<Record<string, Measured<PouchDimensions>>>;
  neck: Readonly<Partial<Record<NeckSupportSize, Measured<NeckSupportDimensions>>>>;
  loftAllowance: number;
  configured?: ReadonlySet<string>;
};

export const CODE_REGISTRY: DimensionRegistry = {
  pouches: POUCH_DIMENSIONS,
  neck: NECK_SUPPORT_DIMENSIONS,
  loftAllowance: LOFT_ALLOWANCE,
};

function sourceOf(key: string, entry: Measured<unknown>, registry: DimensionRegistry): ResolvedSource {
  if (registry.configured?.has(key)) return "configured";
  return entry.measuredOn ? "measured" : "fallback";
}

export function resolveDims(item: DimensionItemLike, registry: DimensionRegistry = CODE_REGISTRY): ResolvedDims {
  const key = pouchKey(item);
  if (key.startsWith("neck/")) {
    const size = key.slice("neck/".length).toUpperCase();
    const entry =
      (NECK_SUPPORT_SIZES as readonly string[]).includes(size)
        ? registry.neck[size as NeckSupportSize]
        : undefined;
    const n = entry ?? NECK_SUPPORT_FALLBACK;
    return {
      key,
      kind: "neck",
      dims: neckAsPouch(n),
      source: entry ? sourceOf(key, entry, registry) : "fallback",
      measuredOn: entry?.measuredOn ?? null,
    };
  }
  const exact = registry.pouches[key];
  if (exact) return pouch(key, exact, sourceOf(key, exact, registry));
  const parts = key.split("/");
  if (parts.length === 3) {
    const unsized = `${parts[0]}/${parts[1]}`;
    const entry = registry.pouches[unsized];
    if (entry) return pouch(key, entry, sourceOf(unsized, entry, registry));
  }
  const family = POUCH_FAMILY_FALLBACKS[parts[0]];
  return pouch(key, family ?? GENERIC_POUCH, "fallback");
}

function pouch(key: string, entry: Measured<PouchDimensions>, source: ResolvedSource): ResolvedDims {
  const { measuredOn, ...dims } = entry;
  return { key, kind: "pouch", dims, source, measuredOn: source === "fallback" ? null : measuredOn };
}

export function formatDims(dims: PouchDimensions): string {
  return `${dims.widthMm} × ${dims.lengthMm} × ${dims.thicknessMm} mm`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
