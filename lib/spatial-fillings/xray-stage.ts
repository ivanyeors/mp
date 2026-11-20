import { SECTIONS, SUB_SECTIONS, type Section, type SubSection } from "./core";
import { PILLOW_DIMENSIONS, type PillowDimensions, type PillowSize } from "./dimensions";

export const XRAY_VIEW = { width: 664, height: 374 } as const;

export type Pt = [number, number];
export type CellKey = `${Section}/${SubSection}`;

export type StageGeometry = {
  size: PillowSize;
  k: number;
  offsetY: number;
  silhouettePath: string;
  silhouettePolygon: Pt[];
  colX: readonly [number, number, number, number];
  rowY: readonly [number, number, number, number];
  cellClipPaths: Record<CellKey, string>;
  cellPolygons: Record<CellKey, Pt[]>;
  sectionHitPaths: Record<Section, string>;
  sectionPolygons: Record<Section, Pt[]>;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const poly = (pts: Pt[]) => `M${pts.map(([x, y]) => `${x} ${y}`).join(" L")} Z`;

const STEPS = 6;

function buildGrid(XS: number[], YS: number[]) {
  const corner = (i: number, j: number): Pt => [r1(XS[i]), r1(YS[j])];

  function vEdge(i: number, j0: number, j1: number): Pt[] {
    const pts: Pt[] = [];
    for (let s = 1; s < STEPS; s++) {
      const y = YS[j0] + ((YS[j1] - YS[j0]) * s) / STEPS;
      pts.push([r1(XS[i]), r1(y)]);
    }
    return pts;
  }

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

export function stageGeometry(size: PillowSize): StageGeometry {
  let stage = cache.get(size);
  if (!stage) {
    stage = build(size);
    cache.set(size, stage);
  }
  return stage;
}
