/**
 * Pure geometry for <SunburstMenu>. No React runtime — safe to run under tsx.
 * Angle convention: 0 rad at 12 o'clock, increasing clockwise.
 */
import type React from "react";

export type SunburstNode = {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
  children?: SunburstNode[];
};

export type ArcSpec = {
  node: SunburstNode;
  path: string[]; // ids root → this node (inclusive)
  depth: number; // 1 = first ring
  innerR: number;
  outerR: number;
  startAngle: number;
  endAngle: number;
  centroid: { x: number; y: number }; // label anchor
  hasChildren: boolean;
};

export type LayoutOpts = {
  cx: number;
  cy: number;
  holeRadius: number; // center gap (trigger button lives here)
  ringWidth: number;
};

const TAU = Math.PI * 2;
const EPS = 1e-6;

/** Point on a circle using the top-is-zero, clockwise convention. */
function polar(cx: number, cy: number, r: number, a: number): [number, number] {
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

/**
 * Annulus-sector SVG path. A wedge spanning (nearly) the whole circle — the case
 * of a ring with a single node — is drawn as a full donut (two half-arcs per edge,
 * opposite winding so the hole renders under the default nonzero fill rule); a
 * single 2π arc degenerates to its own start point and would vanish.
 */
export function arcPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  a0: number,
  a1: number,
): string {
  if (a1 - a0 >= TAU - EPS) return donutPath(cx, cy, innerR, outerR, a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [xo0, yo0] = polar(cx, cy, outerR, a0);
  const [xo1, yo1] = polar(cx, cy, outerR, a1);
  const [xi1, yi1] = polar(cx, cy, innerR, a1);
  const [xi0, yi0] = polar(cx, cy, innerR, a0);
  return [
    `M ${xo0} ${yo0}`,
    `A ${outerR} ${outerR} 0 ${large} 1 ${xo1} ${yo1}`,
    `L ${xi1} ${yi1}`,
    `A ${innerR} ${innerR} 0 ${large} 0 ${xi0} ${yi0}`,
    "Z",
  ].join(" ");
}

/** Full ring with a hole (outer CW, inner CCW → nonzero-rule donut). */
function donutPath(cx: number, cy: number, innerR: number, outerR: number, a0: number): string {
  const mid = a0 + Math.PI;
  const [ox0, oy0] = polar(cx, cy, outerR, a0);
  const [oxm, oym] = polar(cx, cy, outerR, mid);
  const [ix0, iy0] = polar(cx, cy, innerR, a0);
  const [ixm, iym] = polar(cx, cy, innerR, mid);
  return [
    `M ${ox0} ${oy0}`,
    `A ${outerR} ${outerR} 0 1 1 ${oxm} ${oym}`,
    `A ${outerR} ${outerR} 0 1 1 ${ox0} ${oy0}`,
    "Z",
    `M ${ix0} ${iy0}`,
    `A ${innerR} ${innerR} 0 1 0 ${ixm} ${iym}`,
    `A ${innerR} ${innerR} 0 1 0 ${ix0} ${iy0}`,
    "Z",
  ].join(" ");
}

/** Just the outer arc edge (open path, no sides/inner) — for the hover highlight. */
export function outerArcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const [x0, y0] = polar(cx, cy, r, a0);
  if (a1 - a0 >= TAU - EPS) {
    const [xm, ym] = polar(cx, cy, r, a0 + Math.PI);
    return `M ${x0} ${y0} A ${r} ${r} 0 1 1 ${xm} ${ym} A ${r} ${r} 0 1 1 ${x0} ${y0}`;
  }
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const [x1, y1] = polar(cx, cy, r, a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

/**
 * Flat list of arcs to render. The root ring covers the full circle; only the
 * branch named by `expansionPath` fans its children outward (wedge-fan drill) —
 * siblings off the path keep their ring 1 wedge.
 */
export function buildArcs(
  root: SunburstNode[],
  expansionPath: string[],
  opts: LayoutOpts,
): ArcSpec[] {
  const out: ArcSpec[] = [];

  const walk = (
    nodes: SunburstNode[],
    depth: number,
    startAngle: number,
    endAngle: number,
    innerR: number,
    parentPath: string[],
  ) => {
    const n = nodes.length;
    if (n === 0) return;
    const span = endAngle - startAngle;
    const outerR = innerR + opts.ringWidth;
    const expandedId = expansionPath[depth - 1];

    nodes.forEach((node, i) => {
      const a0 = startAngle + (span * i) / n;
      const a1 = startAngle + (span * (i + 1)) / n;
      const path = [...parentPath, node.id];
      const midA = (a0 + a1) / 2;
      const midR = (innerR + outerR) / 2;
      const [cxp, cyp] = polar(opts.cx, opts.cy, midR, midA);
      const hasChildren = !!node.children?.length;
      out.push({
        node,
        path,
        depth,
        innerR,
        outerR,
        startAngle: a0,
        endAngle: a1,
        centroid: { x: cxp, y: cyp },
        hasChildren,
      });
      if (hasChildren && node.id === expandedId) {
        walk(node.children!, depth + 1, a0, a1, outerR, path);
      }
    });
  };

  walk(root, 1, 0, TAU, opts.holeRadius, []);
  return out;
}
