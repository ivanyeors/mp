/**
 * Per-Size stage geometry for the x-ray (X-ray pillow UX slice 02, ADR 0019).
 *
 * The stage is a fixed 664×374 box on every surface; the pillow Size sets one
 * scale, `k = XRAY_VIEW.width / widthMm`, so the silhouette always fills the
 * stage's width and every pouch is drawn at `mm × k`. The silhouette is the
 * registry outline (the M master scaled to the Size, no neck tab) with the
 * notched FRONT edge at the top; the three Section columns sit at the
 * protector's divider seams; the three sub-section rows are thirds of the
 * body length. The nine cell regions are cut from that straight grid: the two
 * column dividers are the protector's seams, the only straight edges the
 * pillow has (ADR 0009 guardrail 1 allows a designed divider). Pure +
 * browser-safe; one geometry per Size, computed once.
 */

import { SECTIONS, SUB_SECTIONS, type Section, type SubSection } from "./core";
import { PILLOW_DIMENSIONS, type PillowDimensions, type PillowSize } from "./dimensions";

export const XRAY_VIEW = { width: 664, height: 374 } as const;

export type Pt = [number, number];
export type CellKey = `${Section}/${SubSection}`;

export type StageGeometry = {
  size: PillowSize;
  /** View units per millimetre. */
  k: number;
  /** Top of the silhouette in view units (the pillow is centred vertically). */
  offsetY: number;
  /** The silhouette as a closed polygon path, view units. */
  silhouettePath: string;
  /** The same silhouette as sampled points, for pouch-conform geometry. */
  silhouettePolygon: Pt[];
  /** Section column boundaries: `[0, left|center, center|right, width]`. */
  colX: readonly [number, number, number, number];
  /** Sub-section row boundaries: front, middle, back — thirds of the body. */
  rowY: readonly [number, number, number, number];
  /** Nine cell boundary paths — `clipPath` regions. */
  cellClipPaths: Record<CellKey, string>;
  /** The same nine regions as polygons. */
  cellPolygons: Record<CellKey, Pt[]>;
  /** Three full-height Section regions for hover highlight / dive hit areas. */
  sectionHitPaths: Record<Section, string>;
  /** The same three regions as polygons: what a settled pouch conforms against (slice 11). */
  sectionPolygons: Record<Section, Pt[]>;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const poly = (pts: Pt[]) => `M${pts.map(([x, y]) => `${x} ${y}`).join(" L")} Z`;

// --- Straight 3×3 grid -------------------------------------------------------
// The two vertical dividers ARE the protector's seams (Ivan, 26-9-2026: follow
// the seam dividers, nothing wavy); the horizontal boundaries are authoring
// guides with no wall behind them. The outer frame extends past the silhouette
// so only interior dividers ever show; adjacent cells share identical sampled
// edge points (STEPS per edge, so the conform pass has vertices to pull), so
// regions tile exactly.

const STEPS = 6;

function buildGrid(XS: number[], YS: number[]) {
  const corner = (i: number, j: number): Pt => [r1(XS[i]), r1(YS[j])];

  /** Interior samples along vertical divider i between rows j0→j1 (corners excluded). */
  function vEdge(i: number, j0: number, j1: number): Pt[] {
    const pts: Pt[] = [];
    for (let s = 1; s < STEPS; s++) {
      const y = YS[j0] + ((YS[j1] - YS[j0]) * s) / STEPS;
      pts.push([r1(XS[i]), r1(y)]);
    }
    return pts;
  }

  /** Interior samples along horizontal divider j between columns i0→i1 (corners excluded). */
  function hEdge(j: number, i0: number, i1: number): Pt[] {
    const pts: Pt[] = [];
    for (let s = 1; s < STEPS; s++) {
      const x = XS[i0] + ((XS[i1] - XS[i0]) * s) / STEPS;
      pts.push([r1(x), r1(YS[j])]);
    }
    return pts;
  }

  function cellPts(a: number, b: number): Pt[] {
    return [
      corner(a, b),
      ...hEdge(b, a, a + 1),
      corner(a + 1, b),
      ...vEdge(a + 1, b, b + 1),
      corner(a + 1, b + 1),
      ...hEdge(b + 1, a + 1, a),
      corner(a, b + 1),
      ...vEdge(a, b + 1, b),
    ];
  }

  function sectionPts(a: number): Pt[] {
    return [
      corner(a, 0),
      ...hEdge(0, a, a + 1),
      corner(a + 1, 0),
      ...vEdge(a + 1, 0, 1),
      corner(a + 1, 1),
      ...vEdge(a + 1, 1, 2),
      corner(a + 1, 2),
      ...vEdge(a + 1, 2, 3),
      corner(a + 1, 3),
      ...hEdge(3, a + 1, a),
      corner(a, 3),
      ...vEdge(a, 3, 2),
      corner(a, 2),
      ...vEdge(a, 2, 1),
      corner(a, 1),
      ...vEdge(a, 1, 0),
    ];
  }

  const cellClipPaths = {} as Record<CellKey, string>;
  const cellPolygons = {} as Record<CellKey, Pt[]>;
  SECTIONS.forEach((section, a) => {
    SUB_SECTIONS.forEach((subSection, b) => {
      const pts = cellPts(a, b);
      cellClipPaths[`${section}/${subSection}`] = poly(pts);
      cellPolygons[`${section}/${subSection}`] = pts;
    });
  });
  const sectionPolygons: Record<Section, Pt[]> = {
    left: sectionPts(0),
    center: sectionPts(1),
    right: sectionPts(2),
  };
  const sectionHitPaths: Record<Section, string> = {
    left: poly(sectionPolygons.left),
    center: poly(sectionPolygons.center),
    right: poly(sectionPolygons.right),
  };
  return { cellClipPaths, cellPolygons, sectionHitPaths, sectionPolygons };
}

/** The registry outline in view units: x across, y down, front edge at the top. */
function silhouettePolygon(dims: PillowDimensions, k: number, offsetY: number): Pt[] {
  return dims.outline.map(([x, y]) => [r1(x * k), r1(offsetY + (dims.lengthMm - y) * k)]);
}

function build(size: PillowSize): StageGeometry {
  const dims = PILLOW_DIMENSIONS[size];
  const k = XRAY_VIEW.width / dims.widthMm;
  const bodyH = dims.lengthMm * k;
  const offsetY = (XRAY_VIEW.height - bodyH) / 2;
  const [l, c] = dims.sectionWidthsMm;
  const colX = [0, r1(l * k), r1((l + c) * k), XRAY_VIEW.width] as const;
  const rowY = [r1(offsetY), r1(offsetY + bodyH / 3), r1(offsetY + (2 * bodyH) / 3), r1(offsetY + bodyH)] as const;
  const polygon = silhouettePolygon(dims, k, offsetY);
  const grid = buildGrid(
    [-10, colX[1], colX[2], XRAY_VIEW.width + 10],
    [-10, rowY[1], rowY[2], XRAY_VIEW.height + 10],
  );
  return {
    size,
    k,
    offsetY,
    silhouettePath: poly(polygon),
    silhouettePolygon: polygon,
    colX,
    rowY,
    ...grid,
  };
}

const cache = new Map<PillowSize, StageGeometry>();

/** The stage for a Size, computed once and shared by every surface. */
export function stageGeometry(size: PillowSize): StageGeometry {
  let stage = cache.get(size);
  if (!stage) {
    stage = build(size);
    cache.set(size, stage);
  }
  return stage;
}
