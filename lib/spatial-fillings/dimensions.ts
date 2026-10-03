/**
 * Physical dimension registry for the x-ray (ADR 0019, X-ray pillow UX slice 01).
 * Every measurement the x-ray needs, in millimetres, in one pure, browser-safe
 * module: the pillow per Size (from the 2018 drawings), the filling pouches,
 * the Cervical Neck support and the Mbolster capsule.
 *
 * - Pillow geometry is code only: outlines, Section widths and gusset heights
 *   come from the drawings, not from anyone's typing.
 * - Pouch, Neck support and bolster values are code DEFAULTS; slice 12 lets
 *   Settings override them per row (row wins, no row = this file).
 * - An entry with `measuredOn: null` is a fallback placeholder: plausible so
 *   the x-ray never blanks, never presented as measured. `resolveDims` says
 *   which is which and never throws.
 */

import { fillingDescriptor, fillingFamily, NECK_SUPPORT } from "./filling-groups";
import {
  SILHOUETTE_MASTER,
  SILHOUETTE_MASTER_LENGTH_MM,
  SILHOUETTE_MASTER_WIDTH_MM,
} from "./silhouette-master";
import type { BolsterLength } from "./xray-layout";

// --- Pillow ------------------------------------------------------------------

export type PillowSize = "XS" | "S" | "M" | "L" | "XL";
export const PILLOW_SIZES: readonly PillowSize[] = ["XS", "S", "M", "L", "XL"];

/**
 * How much the drawn side height and the loft budget exceed the drawing's
 * gusset height, because the case is cloth and gives. 0.10 = 10 %. Slice 12
 * makes this a site setting; this is the shipped default.
 */
export const LOFT_ALLOWANCE = 0.1;

/** Seam between two pressed pouches, mm — across a Section (the width fit) and where two settle to meet along it. */
export const SEAM_MM = 2;

/** A point in the pillow's mm frame: x across the width, y front-to-back. */
export type PointMm = readonly [number, number];

/** The gusset ("Cover Side" strip): the pillow's height profile around its edge. */
export type Gusset = {
  /** Full height along the ends and the sides, mm. */
  fullMm: number;
  /** Height where the strip tapers under the neck, mm. */
  tabEndMm: number;
  /** Run of that taper from the tab end back to full height, mm. */
  taperRunMm: number;
  /** Height at the centre back (the zipper end), mm — one inch below the sides. */
  backMm: number;
  /** Run of the drop into the centre back, mm. */
  dipRunMm: number;
};

/** `[left, center, right]` — one value per Section. */
export type PerSection<T> = readonly [T, T, T];

export type PillowDimensions = {
  size: PillowSize;
  /** Left ↔ right, mm. */
  widthMm: number;
  /** Front ↔ back at the lobe line, mm. The neck tab is not part of it. */
  lengthMm: number;
  /** Section widths at the protector's divider seams, mm; sums to widthMm ± 1. */
  sectionWidthsMm: PerSection<number>;
  gusset: Gusset;
  /** Height budget per Section: `[side, centre, side] × (1 + LOFT_ALLOWANCE)`. */
  maxLoftMm: PerSection<number>;
  /** The finished top-panel outline: the M master scaled to widthMm × lengthMm. */
  outline: readonly PointMm[];
  /** Physically walled sub-sections turn natural settle off. The pillow has Section walls only. */
  subSectionDividers: boolean;
};

/** Max loft per Section for a gusset: sides at full height, the centre one inch lower. */
export function maxLoftMm(gusset: Gusset, allowance: number = LOFT_ALLOWANCE): PerSection<number> {
  const k = 1 + allowance;
  const side = round1(gusset.fullMm * k);
  return [side, round1(gusset.backMm * k), side];
}

/** The master silhouette scaled to a Size's width × body length. */
export function scaledOutline(widthMm: number, lengthMm: number): readonly PointMm[] {
  const sx = widthMm / SILHOUETTE_MASTER_WIDTH_MM;
  const sy = lengthMm / SILHOUETTE_MASTER_LENGTH_MM;
  return SILHOUETTE_MASTER.map(([x, y]) => [round2(x * sx), round2(y * sy)] as const);
}

type PillowSpec = Omit<PillowDimensions, "maxLoftMm" | "outline" | "subSectionDividers">;

/**
 * Measured 22/25-9-2026 from Drive › 01 Drawing (2018): widths and body lengths
 * from the case Top sheets, Section widths from the protector's divider seams,
 * gusset from the case Side sheets; side/centre heights confirmed by
 * "Mpillow Sizes Measurement.xlsx" (side 4''–8'', centre 3''–7'').
 */
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

/**
 * The reference pillow Size (28-9-2026): pouch and Neck support dimensions —
 * code defaults and Settings rows alike — describe the piece as it sits in a
 * Size M pillow. One recipe serves several Sizes (CONTEXT.md, Size
 * membership), and the fillings are cut to the pillow, so every other Size
 * scales them by its own proportions to M (`sizeFactors`).
 */
export const REFERENCE_SIZE: PillowSize = "M";

/** How a Size's pillow compares with the reference, per axis. */
export type SizeFactors = {
  /** Left ↔ right: the pillow width ratio. */
  across: number;
  /** Front ↔ back: the body length ratio. */
  along: number;
  /** Height: the side gusset ratio — the loft budget scales the same, so a fit reads alike at every Size. */
  thickness: number;
};

/**
 * One Size's factors against the reference pillow, from the drawings. On the
 * x-ray the stage is the pillow at every Size (k = view width / pillow
 * width), so a pouch scaled by these draws at the same fraction of its
 * pillow whatever the Size — the XS and XL views read alike, as the pillows
 * do — while the fit budgets real millimetres at the Size.
 */
export function sizeFactors(pillow: Pick<PillowDimensions, "widthMm" | "lengthMm" | "gusset">): SizeFactors {
  const ref = PILLOW_DIMENSIONS[REFERENCE_SIZE];
  return {
    across: pillow.widthMm / ref.widthMm,
    along: pillow.lengthMm / ref.lengthMm,
    thickness: pillow.gusset.fullMm / ref.gusset.fullMm,
  };
}

/** A pouch (or Neck support) at a Size: its reference dimensions × the Size's factors, per axis. */
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

/**
 * item id → the piece as it sits in this pillow, generic pouch for an absent
 * id. The one door the fit, the settle and the layout read dimensions
 * through, so the drawing and the budget can never scale differently.
 * Memoised per reader: O(items) per fit, not per piece.
 */
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

/** The Size a host knows, else M — with the fallback visible to the caller. */
export function pillowDimensions(size: string | null | undefined): {
  dims: PillowDimensions;
  assumed: boolean;
} {
  const key = String(size ?? "").toUpperCase();
  return isPillowSize(key)
    ? { dims: PILLOW_DIMENSIONS[key], assumed: false }
    : { dims: PILLOW_DIMENSIONS.M, assumed: true };
}

// --- Pouches, Neck support, bolster ------------------------------------------

export type PouchDimensions = {
  /** Across the Section (left ↔ right), mm. */
  widthMm: number;
  /** Along the Section (front ↔ back), mm. */
  lengthMm: number;
  /** Relaxed thickness, mm. */
  thicknessMm: number;
  /** Fully compressed thickness, mm. */
  minThicknessMm: number;
  /** Minimum width when squeezed, mm. */
  minWidthMm: number;
  /** The fabric's own spread limit, when it stops a spread before the fill is fully compressed. */
  flatLengthMm?: number;
  flatWidthMm?: number;
};

export type NeckSupportSize = "XS" | "S" | "M" | "L";
export const NECK_SUPPORT_SIZES: readonly NeckSupportSize[] = ["XS", "S", "M", "L"];

/** A Neck support is a mini bolster: a roll lying across the Section. */
export type NeckSupportDimensions = {
  /** Left ↔ right, end to end. */
  lengthMm: number;
  radiusMm: number;
  /** Fully squashed. */
  minRadiusMm: number;
};

/** The roll as a pouch: its diameter is both its thickness and its front ↔ back footprint. */
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

/** A registry entry: the value plus when it was measured; `null` marks a fallback placeholder. */
export type Measured<T> = T & { measuredOn: string | null };

/**
 * Filling pouches by key (`family/variant[/size]`, see `pouchKey`). Ivan's
 * measurements land here with the date measured; none yet, so every pouch
 * resolves to its family fallback until they do (or until Settings carries a
 * row, slice 12).
 */
export const POUCH_DIMENSIONS: Readonly<Record<string, Measured<PouchDimensions>>> = {};

/**
 * Family fallbacks: a plausible pouch of each density so the x-ray draws
 * something honest-sized until the real numbers arrive. Not measured.
 */
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
};

/** The pouch drawn for a type outside every family. Not measured. */
export const GENERIC_POUCH: Measured<PouchDimensions> = {
  widthMm: 180,
  lengthMm: 140,
  thicknessMm: 45,
  minThicknessMm: 25,
  minWidthMm: 150,
  measuredOn: null,
};

/** Cervical Neck support per size. Ivan's measurements land here; none yet. */
export const NECK_SUPPORT_DIMENSIONS: Readonly<
  Partial<Record<NeckSupportSize, Measured<NeckSupportDimensions>>>
> = {};

/** The Neck support drawn until it is measured. */
export const NECK_SUPPORT_FALLBACK: Measured<NeckSupportDimensions> = {
  lengthMm: 300,
  radiusMm: 25,
  minRadiusMm: 15,
  measuredOn: null,
};

/** Mbolster capsule per length. Slice 09 gives it real numbers; placeholders until then. */
export const BOLSTER_DIMENSIONS: Readonly<Record<BolsterLength, Measured<BolsterDimensions>>> = {
  short: { lengthMm: 600, diameterMm: 180, measuredOn: null },
  medium: { lengthMm: 900, diameterMm: 200, measuredOn: null },
  long: { lengthMm: 1200, diameterMm: 200, measuredOn: null },
};

/**
 * True while any entry above is a typed-in placeholder posing as a measurement.
 * The self-check refuses that state, so placeholders cannot merge as truth.
 * Fallbacks are not placeholders: they say `measuredOn: null` and resolve as
 * `fallback`.
 */
export const PLACEHOLDER_DIMENSIONS = false;

// --- Keys and resolution -----------------------------------------------------

export type ResolvedSource = "configured" | "measured" | "fallback";

export type ResolvedDims = {
  /** `family/variant[/size]` for a pouch, `neck/<size>` for a Neck support. */
  key: string;
  kind: "pouch" | "neck";
  dims: PouchDimensions;
  source: ResolvedSource;
  /** Date measured, when the source is `measured`. */
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

/**
 * Registry key for an item. The same pouch reaches here as `"6D (L)"`,
 * `"6D L"` or `{ name: "6D Fold", size: "L" }`, so the key is built from the
 * family and a normalised variant: `6d/l`, `6d/l`, `6d/folded/l`. A Neck
 * support keys as `neck/<size>`; an unknown type as `other/<name>`.
 */
export function pouchKey(item: DimensionItemLike): string {
  const descriptor = fillingDescriptor({ name: item.name, subtype: item.subtype ?? null });
  const size = (item.size ?? "").trim().toLowerCase();
  if (NECK_SUPPORT.test(descriptor) || NECK_SUPPORT.test(item.name)) {
    return `neck/${size || "m"}`;
  }
  const family = fillingFamily(descriptor).key;
  const variant = normaliseVariant(descriptor);
  if (family === "other") return `other/${variant || "unknown"}`;
  if (!variant || SIZE_TOKENS.has(variant)) return `${family}/${variant || size || "unsized"}`;
  return size ? `${family}/${variant}/${size}` : `${family}/${variant}`;
}

/** Everything `resolveDims` reads. The code default is `CODE_REGISTRY`; slice 12 builds one with Settings rows applied. */
export type DimensionRegistry = {
  pouches: Readonly<Record<string, Measured<PouchDimensions>>>;
  neck: Readonly<Partial<Record<NeckSupportSize, Measured<NeckSupportDimensions>>>>;
  loftAllowance: number;
  /** Keys whose values came from Settings rather than code. */
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

/**
 * The dimensions to draw and budget an item with. Never throws, never returns
 * undefined: exact key → key without its size → family fallback → generic
 * pouch, and the `source` says how far down that list it went.
 */
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

/** `180 × 120 × 45 mm`, for the Product Visualize column and the fit messages. */
export function formatDims(dims: PouchDimensions): string {
  return `${dims.widthMm} × ${dims.lengthMm} × ${dims.thicknessMm} mm`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
