/**
 * Cross-section model (X-ray pillow UX slice 05, ADR 0019): the fit result cut
 * along one Section (front, middle, back), as columns against the loft line.
 * Pure: reads the fit the host already computed; the renderer never recomputes
 * it, so the x-ray and the cross-section cannot disagree.
 */

import { SUB_SECTIONS, type Section, type SubSection } from "./core";
import type { ColumnFit, FitStatus, PillowFit } from "./fit";
import { REFERENCE_SIZE, SEAM_MM, type PillowSize, type ResolvedDims } from "./dimensions";

export type Cut = { section: Section };

export const DEFAULT_CUT: Cut = { section: "center" };

export type CrossSectionSlab = {
  depth: number;
  heightMm: number;
  /** The piece that sets the plane's thickness; colours the slab by family. */
  itemId: number;
  status: FitStatus;
  /** A compressed slab is hatched. */
  hatched: boolean;
};

export type CrossSectionColumn = {
  key: SubSection;
  label: string;
  /** The sub-section's length, mm. */
  widthMm: number;
  maxLoftMm: number;
  loftMm: number;
  status: FitStatus;
  /** Bottom → top. Empty for an empty column. */
  slabs: CrossSectionSlab[];
};

function columnOf(key: SubSection, widthMm: number, maxLoftMm: number, column: ColumnFit | null): CrossSectionColumn {
  return {
    key,
    label: key,
    widthMm,
    maxLoftMm,
    loftMm: column?.loftMm ?? 0,
    status: column?.status ?? "ok",
    // Deepest plane at the bottom: the pillow lies on its back panel.
    slabs: (column?.planes ?? [])
      .slice()
      .sort((a, b) => b.depth - a.depth)
      .map((pl) => ({
        depth: pl.depth,
        heightMm: pl.thicknessMm,
        itemId: pl.itemId,
        status: pl.status,
        hatched: pl.status !== "ok",
      })),
  };
}

/**
 * The three sub-sections of the cut's Section, each one cell long. Slab
 * heights sum to the column's `loftMm` and never exceed `maxLoftMm` unless the
 * column is `over`.
 */
export function crossSectionSlabs(fit: PillowFit, cut: Cut): CrossSectionColumn[] {
  const sf = fit.sections[cut.section];
  return SUB_SECTIONS.map((subSection) => columnOf(subSection, fit.settle.cellLengthMm, sf.maxLoftMm, sf.columns[subSection]));
}

/** One piece in the along cut: drawn once over its settled span, stacked on what lies under it. */
export type AlongSlab = {
  key: string;
  itemId: number;
  depth: number;
  /** mm from the Section's front. */
  startMm: number;
  endMm: number;
  /** mm above the back panel. */
  bottomMm: number;
  heightMm: number;
  /** Its thickness at this Size before it settled or was squeezed, mm (the Settings value × the Size's factor). */
  relaxedMm: number;
  /** Its thickness once settled (spread into an empty neighbour thins it), before any squeeze, mm. */
  settledMm: number;
  status: FitStatus;
  hatched: boolean;
};

/**
 * The along cut piece by piece: a pouch that settles front-to-back is one
 * slab, not one per column. Deepest first, each rests on the tallest deeper
 * slab it overlaps, else on the back panel.
 */
export function alongSlabs(fit: PillowFit, section: Section): AlongSlab[] {
  const settled = new Map(fit.settle.pieces.map((s) => [s.key, s] as const));
  const placed: AlongSlab[] = [];
  for (const p of [...fit.sections[section].pieces].sort((a, b) => b.depth - a.depth)) {
    const bottomMm = Math.max(
      0,
      ...placed
        .filter((q) => q.depth > p.depth && Math.min(q.endMm, p.endMm) - Math.max(q.startMm, p.startMm) > SEAM_MM)
        .map((q) => q.bottomMm + q.heightMm),
    );
    placed.push({
      key: p.key,
      itemId: p.itemId,
      depth: p.depth,
      startMm: p.startMm,
      endMm: p.endMm,
      bottomMm,
      heightMm: p.thicknessMm,
      relaxedMm: settled.get(p.key)?.thicknessMm ?? p.thicknessMm,
      settledMm: settled.get(p.key)?.settledThicknessMm ?? p.thicknessMm,
      status: p.status,
      hatched: p.status !== "ok",
    });
  }
  return placed;
}

/** Where the cut is taken, for a caption: "along · center". */
export function cutLabel(cut: Cut): string {
  return `along · ${cut.section}`;
}

const mm = (n: number) => `${Math.round(n)} mm`;

/**
 * Why a slab is as thick as it draws, from the Settings value to the cut:
 * `"30 mm drawn: 45 mm for Size M (not in Settings — family default) → 30 mm at Size XS"`,
 * then `→ … spread along the Section` and `→ … squeezed to close` where those
 * apply. Pouch thicknesses are entered for the reference Size and scale by
 * the gusset (`sizeFactors`); the settle thins a pouch that spreads; the fit
 * squeezes a stack taller than its budget.
 */
export function slabThicknessNote(slab: AlongSlab, size: PillowSize, resolved?: ResolvedDims): string {
  const steps: string[] = [];
  if (resolved) {
    const from =
      resolved.source === "configured"
        ? "Settings"
        : resolved.source === "measured"
          ? `measured ${resolved.measuredOn}`
          : "not in Settings — family default";
    steps.push(`${mm(resolved.dims.thicknessMm)} for Size ${REFERENCE_SIZE} (${from})`);
  }
  if (!resolved || size !== REFERENCE_SIZE) steps.push(`${mm(slab.relaxedMm)} at Size ${size}`);
  if (slab.settledMm < slab.relaxedMm - 0.5) steps.push(`${mm(slab.settledMm)} spread along the Section`);
  if (slab.heightMm < slab.settledMm - 0.5) steps.push(`${mm(slab.heightMm)} squeezed to close`);
  return `${mm(slab.heightMm)} drawn: ${steps.join(" → ")}`;
}
