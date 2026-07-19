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
import { COL_X, ROW_Y, XRAY_VIEW } from "@/lib/spatial-fillings/xray-layout";
import type { ShapeId } from "@/lib/spatial-fillings/visuals";

export { XRAY_VIEW };

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

function cellPath(a: number, b: number): string {
  return poly([
    corner(a, b),
    ...hEdge(b, a, a + 1),
    corner(a + 1, b),
    ...vEdge(a + 1, b, b + 1),
    corner(a + 1, b + 1),
    ...hEdge(b + 1, a + 1, a),
    corner(a, b + 1),
    ...vEdge(a, b + 1, b),
  ]);
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
export const CELL_CLIP_PATHS: Record<CellKey, string> = (() => {
  const paths = {} as Record<CellKey, string>;
  SECTIONS.forEach((section, a) => {
    SUB_SECTIONS.forEach((subSection, b) => {
      paths[`${section}/${subSection}`] = cellPath(a, b);
    });
  });
  return paths;
})();

/** Three full-height Section regions for hover highlight / dive hit areas. */
export const SECTION_HIT_PATHS: Record<Section, string> = {
  left: sectionPath(0),
  center: sectionPath(1),
  right: sectionPath(2),
};

// --- Fluid filling shapes (placeholder; normalized to a 100×100 box) ---------

export const FILLING_SHAPE_PATHS: Record<ShapeId, string> = {
  // soft asymmetric pebble
  pouch3d:
    "M50 10 C72 6 90 24 90 47 C90 72 74 92 49 91 C26 90 10 74 11 49 C12 26 30 13 50 10 Z",
  // taller pouch with a waist dimple
  pouch6d:
    "M50 6 C68 6 80 18 79 36 C78 48 72 50 73 60 C74 76 66 94 50 94 C34 94 26 76 27 60 C28 50 22 48 21 36 C20 18 32 6 50 6 Z",
  // wide pouch with a top notch
  pouch6dPlus:
    "M50 22 C58 12 74 8 84 18 C94 28 94 48 88 62 C82 78 68 90 50 90 C32 90 18 78 12 62 C6 48 6 28 16 18 C26 8 42 12 50 22 Z",
};
