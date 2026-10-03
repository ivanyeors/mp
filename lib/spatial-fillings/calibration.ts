/**
 * Calibration sheet (X-ray pillow UX slice 10): what the x-ray predicts for
 * each bench check, so the build team writes the ruler reading beside it and
 * a disagreement is visible at a glance. Pure and browser-safe: every number
 * comes from the same fit, settle and scaling the x-ray draws with, read
 * through the registry the caller resolved from Settings — never a second
 * model of the pillow.
 */

import { MAX_LAYERS_PER_CELL, type PillowPlacement, type Section } from "./core";
import { neckCatalog, pouchCatalog, type CatalogSource } from "./dimension-overrides";
import {
  maxLoftMm,
  neckAsPouch,
  PILLOW_DIMENSIONS,
  PILLOW_SIZES,
  pouchAtSize,
  sizeFactors,
  type DimensionRegistry,
  type PillowSize,
  type PouchDimensions,
  type ResolvedDims,
} from "./dimensions";
import { fitMessage, fitPillow, type FitStatus } from "./fit";

const r0 = (n: number) => Math.round(n);

/** One pouch as the sheet lists it, with where its numbers came from. */
export type CalibrationPouch = { key: string; label: string; source: CatalogSource; dims: PouchDimensions };

export type LoftBudgetRow = { size: PillowSize; sideMm: number; centreMm: number };

export type FootprintRow = {
  key: string;
  label: string;
  source: CatalogSource;
  /** Per Size: the pouch as it sits in that pillow (M is what was entered). */
  bySize: Record<PillowSize, { widthMm: number; lengthMm: number; thicknessMm: number }>;
};

/** How many Layers of one pouch, across a whole Section, it takes before it squeezes and before it cannot close. */
export type LayersRow = {
  key: string;
  label: string;
  source: CatalogSource;
  /** Per Size and per Section kind: the first Layer count that reads compressed / over, null if none within the cap. */
  bySize: Record<PillowSize, { side: { compressedAt: number | null; overAt: number | null }; centre: { compressedAt: number | null; overAt: number | null } }>;
};

export type SettleRow = {
  key: string;
  label: string;
  source: CatalogSource;
  /** One pouch alone in centre middle of a Size M, front and back empty. */
  spreadFrontMm: number;
  spreadBackMm: number;
  /** Front ↔ back, relaxed and once settled. */
  lengthMm: number;
  settledLengthMm: number;
  thicknessMm: number;
  settledThicknessMm: number;
};

export type SeamRow = { key: string; label: string; source: CatalogSource; seamFromFrontMm: number; bodyLengthMm: number };

export type SqueezeCheck = { label: string; status: FitStatus; message: string };

/** A Size's default Filling Template, as the caller loaded it. */
export type CalibrationTemplate = {
  size: PillowSize;
  tier: string;
  name: string;
  placements: PillowPlacement[];
  dims: ReadonlyMap<number, ResolvedDims>;
};

export type TemplateRow = {
  size: PillowSize;
  tier: string;
  name: string;
  status: FitStatus;
  /** Loft at each Section's middle, mm. */
  middleLoftMm: Record<Section, number>;
  maxLoftMm: Record<Section, number>;
  /** The fit messages of any cell that squeezes or cannot close. */
  notes: string[];
};

export type CalibrationSheet = {
  loftAllowance: number;
  /** Pouches still drawn from a fallback: their predictions are placeholders until measured. */
  unmeasured: string[];
  budgets: LoftBudgetRow[];
  footprints: FootprintRow[];
  neck: FootprintRow[];
  layers: LayersRow[];
  settle: SettleRow[];
  seam: SeamRow | null;
  squeeze: SqueezeCheck[];
  templates: TemplateRow[];
};

const ID = 1;
const one = (d: PouchDimensions): Map<number, ResolvedDims> =>
  new Map([[ID, { key: "calibration", kind: "pouch", dims: d, source: "configured", measuredOn: null }]]);

/** n Layers of one pouch, one per Layer, in a Section's middle cell. */
const stack = (section: Section, n: number): PillowPlacement[] =>
  Array.from({ length: n }, (_, i) => ({ section, subSection: "middle", slot: i + 1, itemId: ID, row: i }));

/** n Layers of one pouch across a whole Section (front, middle and back each n deep): nothing to settle into, as on the bench. */
const fullSection = (section: Section, n: number): PillowPlacement[] =>
  (["front", "middle", "back"] as const).flatMap((subSection) =>
    Array.from({ length: n }, (_, i) => ({ section, subSection, slot: i + 1, itemId: ID, row: i })),
  );

function layersToClose(d: PouchDimensions, size: PillowSize, section: Section, loftAllowance: number) {
  let compressedAt: number | null = null;
  for (let n = 1; n <= MAX_LAYERS_PER_CELL; n++) {
    const cell = fitPillow(fullSection(section, n), { size, dims: one(d), loftAllowance }).cells.find((c) => c.subSection === "middle")!;
    if (cell.status !== "ok" && compressedAt === null) compressedAt = n;
    if (cell.status === "over") return { compressedAt, overAt: n };
  }
  return { compressedAt, overAt: null };
}

/** The sheet for a registry (code defaults folded with Settings) and the default templates the caller loaded. */
export function calibrationSheet(registry: DimensionRegistry, templates: readonly CalibrationTemplate[] = []): CalibrationSheet {
  const allowance = registry.loftAllowance;
  const pouches: CalibrationPouch[] = pouchCatalog(registry).map((p) => ({ key: p.key, label: p.label, source: p.source, dims: p.dims }));
  const atSizes = (d: PouchDimensions) =>
    Object.fromEntries(
      PILLOW_SIZES.map((size) => {
        const s = pouchAtSize(d, sizeFactors(PILLOW_DIMENSIONS[size]));
        return [size, { widthMm: r0(s.widthMm), lengthMm: r0(s.lengthMm), thicknessMm: r0(s.thicknessMm) }];
      }),
    ) as FootprintRow["bySize"];

  const M = PILLOW_DIMENSIONS.M;
  const settle = pouches.map((p): SettleRow => {
    const s = fitPillow([{ section: "center", subSection: "middle", slot: 1, itemId: ID }], { size: "M", dims: one(p.dims), loftAllowance: allowance })
      .settle.pieces[0];
    return {
      key: p.key,
      label: p.label,
      source: p.source,
      spreadFrontMm: r0(s.spreadFrontMm),
      spreadBackMm: r0(s.spreadBackMm),
      lengthMm: r0(s.alongMm),
      settledLengthMm: r0(s.settledLengthMm),
      thicknessMm: r0(s.thicknessMm),
      settledThicknessMm: r0(s.settledThicknessMm),
    };
  });

  // Front and back filled with the same pouch, middle empty: where the two meet, from the front edge.
  const seamPouch = pouches.find((p) => p.key === "6d/l") ?? pouches[0];
  let seam: SeamRow | null = null;
  if (seamPouch) {
    const fit = fitPillow(
      [
        { section: "center", subSection: "front", slot: 1, itemId: ID },
        { section: "center", subSection: "back", slot: 1, itemId: ID },
      ],
      { size: "M", dims: one(seamPouch.dims), loftAllowance: allowance },
    );
    const front = fit.settle.pieces.find((s) => s.subSection === "front")!;
    seam = {
      key: seamPouch.key,
      label: seamPouch.label,
      source: seamPouch.source,
      seamFromFrontMm: r0(fit.settle.cellLengthMm + front.spreadBackMm),
      bodyLengthMm: M.lengthMm,
    };
  }

  // Five 6D L by hand into one Section: side by side in one Layer, and stacked five deep.
  const l = pouches.find((p) => p.key === "6d/l");
  const squeeze: SqueezeCheck[] = [];
  if (l) {
    const sideBySide: PillowPlacement[] = Array.from({ length: 5 }, (_, i) => ({ section: "center", subSection: "middle", slot: i + 1, itemId: ID }));
    for (const [label, placements] of [
      ["Five 6D L side by side, centre middle, Size M", sideBySide],
      ["Five 6D L stacked, centre middle, Size M", stack("center", 5)],
    ] as const) {
      const cell = fitPillow(placements, { size: "M", dims: one(l.dims), loftAllowance: allowance }).cells[0];
      squeeze.push({ label, status: cell.status, message: fitMessage(cell, "M") });
    }
  }

  const neck = neckCatalog(registry).map(
    (n): FootprintRow => ({
      key: `neck/${n.size.toLowerCase()}`,
      label: `Neck support ${n.size}`,
      source: n.source,
      bySize: atSizes(neckAsPouch(n.dims)),
    }),
  );

  return {
    loftAllowance: allowance,
    unmeasured: [...pouches.filter((p) => p.source === "unmeasured").map((p) => p.label), ...neck.filter((n) => n.source === "unmeasured").map((n) => n.label)],
    budgets: PILLOW_SIZES.map((size) => {
      const [side, centre] = maxLoftMm(PILLOW_DIMENSIONS[size].gusset, allowance);
      return { size, sideMm: r0(side), centreMm: r0(centre) };
    }),
    footprints: pouches.map((p) => ({ key: p.key, label: p.label, source: p.source, bySize: atSizes(p.dims) })),
    neck,
    layers: pouches.map((p) => ({
      key: p.key,
      label: p.label,
      source: p.source,
      bySize: Object.fromEntries(
        PILLOW_SIZES.map((size) => [
          size,
          { side: layersToClose(p.dims, size, "left", allowance), centre: layersToClose(p.dims, size, "center", allowance) },
        ]),
      ) as LayersRow["bySize"],
    })),
    settle,
    seam,
    squeeze,
    templates: templates.map((t): TemplateRow => {
      const fit = fitPillow(t.placements, { size: t.size, dims: t.dims, loftAllowance: allowance });
      const sections = ["left", "center", "right"] as const;
      return {
        size: t.size,
        tier: t.tier,
        name: t.name,
        status: fit.status,
        middleLoftMm: Object.fromEntries(sections.map((s) => [s, r0(fit.sections[s].loftBySubSection.middle)])) as Record<Section, number>,
        maxLoftMm: Object.fromEntries(sections.map((s) => [s, r0(fit.sections[s].maxLoftMm)])) as Record<Section, number>,
        notes: fit.cells.filter((c) => c.status !== "ok").map((c) => fitMessage(c, t.size)),
      };
    }),
  };
}
