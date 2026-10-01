/**
 * Cross-section model (X-ray pillow UX slice 05, ADR 0019): the fit result cut
 * across the pillow (left, center, right at one sub-section) or along one
 * Section (front, middle, back), as columns of slabs against the loft line.
 * Pure: reads the fit the host already computed; the renderer never recomputes
 * it, so the x-ray and the cross-section cannot disagree.
 */

import { SECTIONS, SUB_SECTIONS, type Section, type SubSection } from "./core";
import type { ColumnFit, FitStatus, PillowFit } from "./fit";

export type Cut = { axis: "across"; subSection: SubSection } | { axis: "along"; section: Section };

export const DEFAULT_CUT: Cut = { axis: "across", subSection: "middle" };

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
  key: Section | SubSection;
  label: string;
  /** The column's extent along the cut, mm: a Section's width across, a sub-section's length along. */
  widthMm: number;
  maxLoftMm: number;
  loftMm: number;
  status: FitStatus;
  /** Bottom → top. Empty for an empty column. */
  slabs: CrossSectionSlab[];
};

function columnOf(key: Section | SubSection, widthMm: number, maxLoftMm: number, column: ColumnFit | null): CrossSectionColumn {
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
 * The columns of one cut. Across: the three Sections at `subSection`, each as
 * wide as its Section. Along: the three sub-sections of `section`, each one
 * cell long. Slab heights sum to the column's `loftMm` and never exceed
 * `maxLoftMm` unless the column is `over`.
 */
export function crossSectionSlabs(fit: PillowFit, cut: Cut): CrossSectionColumn[] {
  if (cut.axis === "across") {
    return SECTIONS.map((section) => {
      const sf = fit.sections[section];
      return columnOf(section, sf.widthMm, sf.maxLoftMm, sf.columns[cut.subSection]);
    });
  }
  const sf = fit.sections[cut.section];
  return SUB_SECTIONS.map((subSection) => columnOf(subSection, fit.settle.cellLengthMm, sf.maxLoftMm, sf.columns[subSection]));
}

/** Where the cut is taken, for a caption: "across · middle" / "along · center". */
export function cutLabel(cut: Cut): string {
  return cut.axis === "across" ? `across · ${cut.subSection}` : `along · ${cut.section}`;
}
