/**
 * Pouch-conform geometry (ADR 0009 guardrail 1, with rounded junctions):
 * clipping a pouch against the shell leaves sharp cut corners, so instead the
 * pouch OUTLINE deforms — its sampled points are pulled to seam distance
 * inside every shell region, then Chaikin corner-cutting smooths the polyline
 * so the outline meets the shell on a curve, never a hard bend. Pure +
 * deterministic: same inputs, same path.
 */

import { bolsterStage, type BolsterLength, type PieceRect } from "./xray-layout";
import type { ShapeId } from "./visuals";

export type Pt = [number, number];

const NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/g;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Sample an absolute M/L/C/Z path into a closed polygon. */
export function parsePathPolygon(d: string, curveSamples = 8): Pt[] {
  const pts: Pt[] = [];
  let cur: Pt = [0, 0];
  for (const [, cmd, argStr] of d.matchAll(/([MLCZ])([^MLCZ]*)/g)) {
    const nums = (argStr.match(NUM) ?? []).map(Number);
    if (cmd === "M" || cmd === "L") {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        cur = [nums[i], nums[i + 1]];
        pts.push(cur);
      }
    } else if (cmd === "C") {
      for (let i = 0; i + 5 < nums.length; i += 6) {
        const [x1, y1, x2, y2, x, y] = nums.slice(i, i + 6);
        const [x0, y0] = cur;
        for (let s = 1; s <= curveSamples; s++) {
          const t = s / curveSamples;
          const u = 1 - t;
          pts.push([
            u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
            u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y,
          ]);
        }
        cur = [x, y];
      }
    }
  }
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first && last && Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-6) pts.pop();
  return pts;
}

export function pointInPolygon([px, py]: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Nearest boundary point + the boundary's inward unit normal there.
 * ponytail: O(segments) scan per query — spatial index if polygons ever grow.
 */
export function nearestOnBoundary(
  p: Pt,
  poly: Pt[],
  sign: 1 | -1,
): { q: Pt; n: Pt; dist: number } {
  let best = Infinity;
  let q: Pt = poly[0];
  let n: Pt = [0, 0];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
    const cx = a[0] + t * dx;
    const cy = a[1] + t * dy;
    const d2 = (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
    if (d2 < best) {
      best = d2;
      q = [cx, cy];
      const l = Math.hypot(dx, dy) || 1;
      n = [(sign * dy) / l, (-sign * dx) / l];
    }
  }
  return { q, n, dist: Math.sqrt(best) };
}

/** A shell region a pouch must stay `seam` inside of. */
export type ConformRegion = { poly: Pt[]; seam: number; sign: 1 | -1 };

export function makeRegion(poly: Pt[], seam: number): ConformRegion {
  // Orientation-agnostic inward side: step off segment 0 and test insideness.
  const [a, b] = [poly[0], poly[1]];
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const probe: Pt = [
    (a[0] + b[0]) / 2 + ((b[1] - a[1]) / l) * 0.5,
    (a[1] + b[1]) / 2 - ((b[0] - a[0]) / l) * 0.5,
  ];
  return { poly, seam, sign: pointInPolygon(probe, poly) ? 1 : -1 };
}

/** One round of Chaikin corner cutting on a closed polyline. */
export function chaikin(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    out.push(
      [0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]],
      [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]],
    );
  }
  return out;
}

/** Insert points so no segment exceeds maxSeg — long edges must bend in conform. */
const densify = (pts: Pt[], maxSeg = 8): Pt[] => {
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    out.push(a);
    const splits = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxSeg);
    for (let s = 1; s <= splits; s++) {
      const t = s / (splits + 1);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
};

/**
 * Pouch outline built in view space for its tract rect. Corner radius follows
 * the SHORT side and grows with compression (aspect ratio), so a squeezed
 * pouch rounds into a capsule instead of squashing its corners sharp — a
 * stretched normalized shape would scale the radii down with the narrow axis.
 */
export function pouchOutline(rect: PieceRect, arcSamples = 5, shape: ShapeId = "pouch"): Pt[] {
  if (shape === "pill") {
    // The pill IS its rect: since slice 02 the layout hands it the Neck
    // support's registry footprint, so no aspect cap is needed to make it read
    // as a pill (the old `long / 2.2` cap thinned a tract-shaped rect). Sampled
    // finer so its big round ends stay smooth.
    arcSamples = Math.max(arcSamples, 10);
  }
  const { x, y, w, h } = rect;
  const short = Math.min(w, h);
  const aspect = Math.max(w, h) / (short || 1);
  // relaxed pouch ≈ 28% radius; full capsule from ~3:1 compression onward.
  // A pill is always the full capsule — it stretches, its ends stay round.
  const t = shape === "pill" ? 1 : Math.min(Math.max((aspect - 1) / 2, 0), 1);
  const r = (short / 2) * (0.55 + 0.45 * t);
  const centers: Pt[] = [
    [x + w - r, y + r],
    [x + w - r, y + h - r],
    [x + r, y + h - r],
    [x + r, y + r],
  ];
  const pts: Pt[] = [];
  centers.forEach(([cx, cy], corner) => {
    for (let i = 0; i <= arcSamples; i++) {
      const a = ((corner - 1) * Math.PI) / 2 + (Math.PI / 2) * (i / arcSamples);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  });
  // full-capsule corners share centers → consecutive arc endpoints coincide
  return densify(dedupe(pts));
}

/** Drop consecutive (and wrap-around) duplicates — zero-length segments break angles. */
const dedupe = (pts: Pt[]): Pt[] =>
  pts.filter((p, i) => {
    const prev = pts[(i - 1 + pts.length) % pts.length];
    return Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 1e-6;
  });

/**
 * The pouch outline for `rect`, deformed to stay `seam` inside every region,
 * then smoothed (Chaikin) so it meets the shell on a curve.
 */
export function conformPouchPath(
  rect: PieceRect,
  regions: ConformRegion[],
  smoothing = 2,
  shape: ShapeId = "pouch",
): string {
  let pts = pouchOutline(rect, 5, shape);
  // Two passes: a pull inside one region may cross another near shared corners.
  for (let pass = 0; pass < 2; pass++) {
    for (const { poly, seam, sign } of regions) {
      pts = pts.map((p) => {
        const inside = pointInPolygon(p, poly);
        const { q, n, dist } = nearestOnBoundary(p, poly, sign);
        if (!inside || dist < seam) return [q[0] + n[0] * seam, q[1] + n[1] * seam];
        return p;
      });
    }
  }
  for (let s = 0; s < smoothing; s++) pts = chaikin(pts);
  const out = dedupe(pts.map(([x, y]): Pt => [r1(x), r1(y)]));
  return `M${out.map(([x, y]) => `${x} ${y}`).join(" L")} Z`;
}

/**
 * Where a piece's label sits: a rect centred on the conformed outline's area
 * centroid, as large as the outline's bounding box allows around that point.
 * A pouch that fills its compartment is cut by the silhouette's notch or a
 * wall, so its rect's centre can lie off the visible body — the centroid of
 * what is actually drawn never does.
 */
export function labelRectOf(d: string): PieceRect {
  const pts = parsePathPolygon(d);
  if (pts.length < 3) return { x: 0, y: 0, w: 0, h: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
    minX = Math.min(minX, x0);
    maxX = Math.max(maxX, x0);
    minY = Math.min(minY, y0);
    maxY = Math.max(maxY, y0);
  }
  if (Math.abs(a) < 1e-6) {
    cx = (minX + maxX) / 2;
    cy = (minY + maxY) / 2;
  } else {
    cx /= 3 * a;
    cy /= 3 * a;
  }
  const w = 2 * Math.min(cx - minX, maxX - cx);
  const h = 2 * Math.min(cy - minY, maxY - cy);
  return { x: r1(cx - w / 2), y: r1(cy - h / 2), w: r1(w), h: r1(h) };
}

/** The Mbolster capsule sampled as a polygon (flat sides + semicircular caps), at the length's stage (slice 09: the diameter sets its height). */
export function bolsterShellPolygon(length: BolsterLength, arcSamples = 24): Pt[] {
  const { lengthView: len, heightView, x0, cy } = bolsterStage(length);
  const r = heightView / 2;
  const x1 = x0 + len;
  const pts: Pt[] = [
    [x0 + r, cy - r],
    [x1 - r, cy - r],
  ];
  for (let i = 1; i < arcSamples; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / arcSamples;
    pts.push([x1 - r + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  pts.push([x1 - r, cy + r], [x0 + r, cy + r]);
  for (let i = 1; i < arcSamples; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / arcSamples;
    pts.push([x0 + r + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
}
