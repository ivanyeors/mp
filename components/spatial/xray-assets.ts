/**
 * X-ray SVG assets (ADR 0009 guardrail 5: one asset pipeline).
 *
 * Slice 02 (ADR 0019): the pillow silhouette, the Section columns and the
 * nine cell regions are per Size — `stageGeometry(size)` in
 * lib/spatial-fillings/xray-stage builds them from the dimension registry (the
 * M master outline scaled to the Size, no neck tab). The constants below are
 * the M stage, kept for callers that read one geometry (tests, thumbnails);
 * every renderer takes the Size and reads its own stage.
 *
 * The filling shapes are still the PLACEHOLDER standing in for the designer
 * SVG export; when it lands, replace the path data below — the exported
 * contract (these names and record shapes) is the drop-in point.
 */

import type { Section } from "@/lib/spatial-fillings/core";
import {
  stageGeometry,
  XRAY_VIEW,
  type CellKey,
  type Pt,
} from "@/lib/spatial-fillings/xray-stage";
import { bolsterStage, type BolsterLength } from "@/lib/spatial-fillings/xray-layout";
import type { ShapeId } from "@/lib/spatial-fillings/visuals";

export { XRAY_VIEW, stageGeometry };
export type { CellKey };

/**
 * Mbolster capsule silhouette (shared with the /mbolster-config preview).
 * PLACEHOLDER path with the same drop-in contract — the designer export
 * replaces the data; the capsule renderer clips against this path only
 * (single region: no cell/section paths for bolster, ADR 0008 amendment).
 */
export const BOLSTER_SILHOUETTE_PATH =
  "M80 40 C80 18 120 18 160 18 L504 18 C544 18 584 18 584 40 L584 334 C584 356 544 356 504 356 L160 356 C120 356 80 356 80 334 Z";

const M_STAGE = stageGeometry("M");

/** Pillow silhouette of the M stage (the registry outline; other Sizes via `stageGeometry`). */
export const SILHOUETTE_PATH: string = M_STAGE.silhouettePath;

/** Nine cell boundary paths of the M stage — `clipPath` regions (columns = Sections, rows = sub-sections). */
export const CELL_CLIP_PATHS: Record<CellKey, string> = M_STAGE.cellClipPaths;
/** The same nine cell regions as sampled polygons, for pouch-conform geometry. */
export const CELL_POLYGONS: Record<CellKey, Pt[]> = M_STAGE.cellPolygons;

/** Three full-height Section regions of the M stage for hover highlight / dive hit areas. */
export const SECTION_HIT_PATHS: Record<Section, string> = M_STAGE.sectionHitPaths;
/** The same three regions as polygons — what a settled pouch conforms against (slice 11). */
export const SECTION_POLYGONS: Record<Section, Pt[]> = M_STAGE.sectionPolygons;

// --- Filling shape (normalized to a 100×100 box) -----------------------------
// ponytail: one rounded-square pouch for every filling type; color (per
// subtype) + true-scale footprint (per registry) differentiate. Designer fluid
// shapes re-expand this record when they land — renderer and morph pipeline are ready.

// Puffed fabric pouch: rounded square with gently bulging edges, like the
// stuffed product pouch (photo reference), not a flat UI rect. Fills its full
// 100×100 box so a packed pouch reaches its tract edge and presses the shell.
export const FILLING_SHAPE_PATHS: Record<ShapeId, string> = {
  pouch:
    "M50 2 C73 2 93 8 93 28 C93 43 95 57 93 72 C93 92 73 98 50 98 " +
    "C27 98 7 92 7 72 C5 57 5 43 7 28 C7 8 27 2 50 2 Z",
  // Neck support: a stadium, round ends on the short axis (thumbnail only — the
  // x-ray builds the stretched outline in conform.ts).
  pill: "M30 20 L70 20 C87 20 98 34 98 50 C98 66 87 80 70 80 L30 80 C13 80 2 66 2 50 C2 34 13 20 30 20 Z",
  // Ear Comfort Pad: a puffy square, its corners rounder than a pouch's. Its
  // sewn well is drawn on top (`EAR_WELL_THUMB_PATH`), not cut out, so the
  // shape stays one ring the morphs can interpolate.
  ear:
    "M50 6 C72 6 88 6 92 14 C96 22 94 36 94 50 C94 64 96 78 92 86 C88 94 72 94 50 94 " +
    "C28 94 12 94 8 86 C4 78 6 64 6 50 C6 36 4 22 8 14 C12 6 28 6 50 6 Z",
};

/** The Ear Comfort Pad thumbnail's sewn well, in the same 100×100 box. */
export const EAR_WELL_THUMB_PATH = "M36 50 A14 14 0 1 0 64 50 A14 14 0 1 0 36 50 Z";

/**
 * Air line between the fillings and the shell, in view units — pouch outlines
 * deform to stay this far inside the shell (see conform.ts). A hair (Ivan,
 * 26-9-2026: the fill presses to the shell, fully stuffed): the shell's own
 * 3-unit outline covers most of it, so what shows is a thread of seam.
 */
export const SHELL_SEAM = 2;

/** The M silhouette sampled as a polygon, for pouch-conform geometry. */
export const SILHOUETTE_POLYGON: Pt[] = M_STAGE.silhouettePolygon;

// --- Mbolster capsule silhouette ---------------------------------------------

/** Long-pill silhouette, length driven by the Mbolster length (shared 664×374 view). */
export function bolsterCapsulePath(length: BolsterLength): string {
  // The length's stage (slice 09): the registry diameter sets the height.
  const { lengthView: len, heightView, x0, cy } = bolsterStage(length);
  const r = heightView / 2;
  const x1 = x0 + len;
  return (
    `M${x0 + r} ${cy - r} L${x1 - r} ${cy - r} A${r} ${r} 0 0 1 ${x1 - r} ${cy + r} ` +
    `L${x0 + r} ${cy + r} A${r} ${r} 0 0 1 ${x0 + r} ${cy - r} Z`
  );
}
