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

const CHAR_W = 6; // px per character at the 10px label font
const LABEL_PAD = 6; // px breathing room each side of a label
const MIN_CONTENT_W = 20; // px floor so an icon-only / 1-char wedge stays tappable
const MAX_HUG = TAU / 4; // a hugged sibling never claims more than a quarter turn
const MIN_EXPANDED_FRAC = 0.4; // the drilled branch always keeps >= 40% of its parent span

/** Point on a circle using the top-is-zero, clockwise convention. */
function polar(cx: number, cy: number, r: number, a: number): [number, number] {
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

/** Angular width (radians) a collapsed sibling needs to just hug its label at radius `midR`. */
function hugSpan(label: string, midR: number): number {
  const w = Math.max(MIN_CONTENT_W, label.length * CHAR_W) + 2 * LABEL_PAD;
  return Math.min(MAX_HUG, w / midR);
}

/** Label anchor: midpoint of the annulus sector. */
export function arcCentroid(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  a0: number,
  a1: number,
): { x: number; y: number } {
  const [x, y] = polar(cx, cy, (innerR + outerR) / 2, (a0 + a1) / 2);
  return { x, y };
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
    const total = endAngle - startAngle;
    const outerR = innerR + opts.ringWidth;
    const midR = (innerR + outerR) / 2;
    const expandedId = expansionPath[depth - 1];
    const expandedIdx = nodes.findIndex((nd) => nd.id === expandedId);

    // Equal wedges at rest; when a branch is drilled its siblings shrink to hug
    // their labels and the drilled branch takes all the remaining span.
    const spans = new Array<number>(n);
    if (expandedIdx < 0) {
      spans.fill(total / n);
    } else {
      let sumHug = 0;
      nodes.forEach((nd, i) => {
        if (i === expandedIdx) return;
        spans[i] = hugSpan(nd.label, midR);
        sumHug += spans[i]!;
      });
      const maxSiblings = total * (1 - MIN_EXPANDED_FRAC);
      if (sumHug > maxSiblings) {
        const scale = maxSiblings / sumHug;
        for (let i = 0; i < n; i++) if (i !== expandedIdx) spans[i]! *= scale;
        sumHug = maxSiblings;
      }
      spans[expandedIdx] = total - sumHug;
    }

    let a0 = startAngle;
    nodes.forEach((node, i) => {
      const a1 = a0 + spans[i]!;
      const path = [...parentPath, node.id];
      const hasChildren = !!node.children?.length;
      out.push({
        node,
        path,
        depth,
        innerR,
        outerR,
        startAngle: a0,
        endAngle: a1,
        centroid: arcCentroid(opts.cx, opts.cy, innerR, outerR, a0, a1),
        hasChildren,
      });
      if (hasChildren && node.id === expandedId) {
        walk(node.children!, depth + 1, a0, a1, outerR, path);
      }
      a0 = a1;
    });
  };

  walk(root, 1, 0, TAU, opts.holeRadius, []);
  return out;
}
