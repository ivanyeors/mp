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

export const BOLSTER_SILHOUETTE_PATH =
  "M80 40 C80 18 120 18 160 18 L504 18 C544 18 584 18 584 40 L584 334 C584 356 544 356 504 356 L160 356 C120 356 80 356 80 334 Z";

const M_STAGE = stageGeometry("M");

export const SILHOUETTE_PATH: string = M_STAGE.silhouettePath;

export const CELL_CLIP_PATHS: Record<CellKey, string> = M_STAGE.cellClipPaths;
export const CELL_POLYGONS: Record<CellKey, Pt[]> = M_STAGE.cellPolygons;

export const SECTION_HIT_PATHS: Record<Section, string> = M_STAGE.sectionHitPaths;
export const SECTION_POLYGONS: Record<Section, Pt[]> = M_STAGE.sectionPolygons;

// ponytail: one rounded-square pouch for every filling type; color (per subtype) + true-scale
// footprint (per registry) differentiate. Designer fluid shapes re-expand this record when they
// land — renderer and morph pipeline are ready.

export const FILLING_SHAPE_PATHS: Record<ShapeId, string> = {
  pouch:
    "M50 2 C73 2 93 8 93 28 C93 43 95 57 93 72 C93 92 73 98 50 98 " +
    "C27 98 7 92 7 72 C5 57 5 43 7 28 C7 8 27 2 50 2 Z",
  pill: "M30 20 L70 20 C87 20 98 34 98 50 C98 66 87 80 70 80 L30 80 C13 80 2 66 2 50 C2 34 13 20 30 20 Z",
  ear:
    "M50 6 C72 6 88 6 92 14 C96 22 94 36 94 50 C94 64 96 78 92 86 C88 94 72 94 50 94 " +
    "C28 94 12 94 8 86 C4 78 6 64 6 50 C6 36 4 22 8 14 C12 6 28 6 50 6 Z",
};

export const EAR_WELL_THUMB_PATH = "M36 50 A14 14 0 1 0 64 50 A14 14 0 1 0 36 50 Z";

export const SHELL_SEAM = 2;

export const SILHOUETTE_POLYGON: Pt[] = M_STAGE.silhouettePolygon;

export function bolsterCapsulePath(length: BolsterLength): string {
  const { lengthView: len, heightView, x0, cy } = bolsterStage(length);
  const r = heightView / 2;
  const x1 = x0 + len;
  return (
    `M${x0 + r} ${cy - r} L${x1 - r} ${cy - r} A${r} ${r} 0 0 1 ${x1 - r} ${cy + r} ` +
    `L${x0 + r} ${cy + r} A${r} ${r} 0 0 1 ${x0 + r} ${cy - r} Z`
  );
}
