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

export type CalibrationPouch = { key: string; label: string; source: CatalogSource; dims: PouchDimensions };

export type LoftBudgetRow = { size: PillowSize; sideMm: number; centreMm: number };

export type FootprintRow = {
  key: string;
  label: string;
  source: CatalogSource;
  bySize: Record<PillowSize, { widthMm: number; lengthMm: number; thicknessMm: number }>;
};

export type LayersRow = {
  key: string;
  label: string;
  source: CatalogSource;
  bySize: Record<PillowSize, { side: { compressedAt: number | null; overAt: number | null }; centre: { compressedAt: number | null; overAt: number | null } }>;
};

export type SettleRow = {
  key: string;
  label: string;
  source: CatalogSource;
  spreadFrontMm: number;
  spreadBackMm: number;
  lengthMm: number;
  settledLengthMm: number;
  thicknessMm: number;
  settledThicknessMm: number;
};

export type SeamRow = { key: string; label: string; source: CatalogSource; seamFromFrontMm: number; bodyLengthMm: number };

export type SqueezeCheck = { label: string; status: FitStatus; message: string };

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
  middleLoftMm: Record<Section, number>;
  maxLoftMm: Record<Section, number>;
  notes: string[];
};

export type CalibrationSheet = {
  loftAllowance: number;
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

const stack = (section: Section, n: number): PillowPlacement[] =>
  Array.from({ length: n }, (_, i) => ({ section, subSection: "middle", slot: i + 1, itemId: ID, row: i }));

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
      seamFromFrontMm: r0(front.endMm),
      bodyLengthMm: M.lengthMm,
    };
  }

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
