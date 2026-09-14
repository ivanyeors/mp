/**
 * X-ray SVG assets (ADR 0009 guardrail 5: one asset pipeline).
 *
 * PLACEHOLDER standing in for the designer SVG export. When the export lands
 * (silhouette + 9 cell boundary paths + per-filling fluid shapes), replace the
 * path data below — the exported contract (these names and record shapes) is
 * the drop-in point; renderer and layout stay untouched.
 *
 * ponytail: cell/section paths are generated wavy-divider polygons so no clip
 * edge is a plain straight line; designer curves replace the generated data.
 */

import { SECTIONS, SUB_SECTIONS, type Section, type SubSection } from "@/lib/spatial-fillings/core";
import { parsePathPolygon } from "@/lib/spatial-fillings/conform";
import {
  BOLSTER_CAPSULE_HEIGHT,
  BOLSTER_CAPSULE_LENGTHS,
  COL_X,
  ROW_Y,
  XRAY_VIEW,
  type BolsterLength,
} from "@/lib/spatial-fillings/xray-layout";
import type { ShapeId } from "@/lib/spatial-fillings/visuals";

export { XRAY_VIEW };

/**
 * Mbolster capsule silhouette (shared with the /mbolster-config preview).
 * PLACEHOLDER path with the same drop-in contract — the designer export
 * replaces the data; the capsule renderer clips against this path only
 * (single region: no cell/section paths for bolster, ADR 0008 amendment).
 */
export const BOLSTER_SILHOUETTE_PATH =
  "M80 40 C80 18 120 18 160 18 L504 18 C544 18 584 18 584 40 L584 334 C584 356 544 356 504 356 L160 356 C120 356 80 356 80 334 Z";

/** Pillow silhouette (shared with the configurator preview). */
export const SILHOUETTE_PATH =
  "M441.322 14.7728C409.558 27.3692 379.727 35.5927 331.965 35.5927C284.202 35.5927 254.372 27.3692 222.607 14.7728C182.901 -0.972711 120.418 -7.80227 69.7585 31.9038C19.099 71.6098 -2.80784 127.746 1.29974 209.896C5.52474 294.395 33.4738 349.165 83.8767 349.165C134.28 349.165 132.251 315.979 160.907 298.148C183.771 283.922 213.925 285.205 229.723 298.148C251.964 316.368 255.062 333.726 263.277 352.894C269.849 368.229 295.474 372.828 331.271 372.828L332.658 372.828C368.455 372.828 394.08 368.229 400.652 352.894C408.867 333.726 411.966 316.368 434.206 298.148C450.005 285.205 480.158 283.922 503.022 298.148C531.678 315.979 529.65 349.165 580.052 349.165C630.455 349.165 658.404 294.395 662.629 209.896C666.737 127.746 644.83 71.6098 594.171 31.9038C543.511 -7.80226 481.029 -0.972712 441.322 14.7728Z";

// --- Generated wavy 3×3 grid (placeholder for designer cell boundaries) ------
// Outer frame extends past the silhouette so only interior dividers ever show;
// adjacent cells share identical sampled edge points, so regions tile exactly.

const XS = [-10, COL_X[1], COL_X[2], XRAY_VIEW.width + 10];
const YS = [-10, ROW_Y[1], ROW_Y[2], XRAY_VIEW.height + 10];
const AMP = 9;
const STEPS = 6;

const wave = (t: number, seed: number) => AMP * Math.sin(t * Math.PI * 2 + seed);
const dx = (i: number, y: number) => (i > 0 && i < 3 ? wave(y / YS[3], i * 2.1) : 0);
const dy = (j: number, x: number) => (j > 0 && j < 3 ? wave(x / XS[3], j * 1.7) : 0);

type Pt = [number, number];
const r1 = (n: number) => Math.round(n * 10) / 10;

const corner = (i: number, j: number): Pt => [r1(XS[i] + dx(i, YS[j])), r1(YS[j] + dy(j, XS[i]))];

/** Interior samples along vertical divider i between rows j0→j1 (corners excluded). */
function vEdge(i: number, j0: number, j1: number): Pt[] {
  const pts: Pt[] = [];
  for (let s = 1; s < STEPS; s++) {
    const y = YS[j0] + ((YS[j1] - YS[j0]) * s) / STEPS;
    pts.push([r1(XS[i] + dx(i, y)), r1(y)]);
  }
  return pts;
}

/** Interior samples along horizontal divider j between columns i0→i1 (corners excluded). */
function hEdge(j: number, i0: number, i1: number): Pt[] {
  const pts: Pt[] = [];
  for (let s = 1; s < STEPS; s++) {
    const x = XS[i0] + ((XS[i1] - XS[i0]) * s) / STEPS;
    pts.push([r1(x), r1(YS[j] + dy(j, x))]);
  }
  return pts;
}

const poly = (pts: Pt[]) => `M${pts.map(([x, y]) => `${x} ${y}`).join(" L")} Z`;

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

function sectionPath(a: number): string {
  return poly([
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
  ]);
}

export type CellKey = `${Section}/${SubSection}`;

/** Nine cell boundary paths — `clipPath` regions (columns = Sections, rows = sub-sections). */
export const CELL_CLIP_PATHS = {} as Record<CellKey, string>;
/** The same nine cell regions as sampled polygons, for pouch-conform geometry. */
export const CELL_POLYGONS = {} as Record<CellKey, Pt[]>;
SECTIONS.forEach((section, a) => {
  SUB_SECTIONS.forEach((subSection, b) => {
    const pts = cellPts(a, b);
    CELL_CLIP_PATHS[`${section}/${subSection}`] = poly(pts);
    CELL_POLYGONS[`${section}/${subSection}`] = pts;
  });
});

/** Three full-height Section regions for hover highlight / dive hit areas. */
export const SECTION_HIT_PATHS: Record<Section, string> = {
  left: sectionPath(0),
  center: sectionPath(1),
  right: sectionPath(2),
};

// --- Filling shape (normalized to a 100×100 box) -----------------------------
// ponytail: one rounded-square pouch for every filling type; color (per
// subtype) + scale (per Item size) differentiate. Designer fluid shapes
// re-expand this record when they land — renderer and morph pipeline are ready.

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
};

/**
 * Visible air line between the fillings and the shell, in view units — pouch
 * outlines deform to stay this far inside the shell (see conform.ts), so the
 * seam reads at the rounded ends too. Pouch-to-pouch seams stay at the layout
 * GAP; this one is wider so it survives next to the shell's thick outline.
 */
export const SHELL_SEAM = 4;

/** Pillow silhouette sampled as a polygon, for pouch-conform geometry. */
export const SILHOUETTE_POLYGON = parsePathPolygon(SILHOUETTE_PATH, 10);

// --- Mbolster capsule silhouette ---------------------------------------------

/** Long-pill silhouette, length driven by the Mbolster length (shared 664×374 view). */
export function bolsterCapsulePath(length: BolsterLength): string {
  const len = BOLSTER_CAPSULE_LENGTHS[length];
  const r = BOLSTER_CAPSULE_HEIGHT / 2;
  const x0 = (XRAY_VIEW.width - len) / 2;
  const x1 = x0 + len;
  const cy = XRAY_VIEW.height / 2;
  return (
    `M${x0 + r} ${cy - r} L${x1 - r} ${cy - r} A${r} ${r} 0 0 1 ${x1 - r} ${cy + r} ` +
    `L${x0 + r} ${cy + r} A${r} ${r} 0 0 1 ${x0 + r} ${cy - r} Z`
  );
}
