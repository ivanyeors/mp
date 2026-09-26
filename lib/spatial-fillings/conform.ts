/**
 * Pouch geometry (ADR 0009 guardrail 1, rounded everywhere): a pouch fills
 * its compartment, so its outline IS the compartment — the shell inset by its
 * seam, cut down to the cell or Section walls and to the pouch's own rect —
 * with every corner filleted: the pouch's own corners at the pouch radius,
 * and every corner where a wall meets the shell or another wall at the same
 * radius as far as the geometry allows (Ivan, 26-9-2026: no sharp edge
 * anywhere, the fill reads as stuffing pressed into a rounded compartment).
 * No point projection, so no kink where a pulled run meets a free one. Pure +
 * deterministic: same inputs, same path.
 */

import { bolsterStage, type BolsterLength, type PieceRect } from "./xray-layout";
import { openRing } from "./opening";
import type { ShapeId } from "./visuals";

export type Pt = [number, number];

const NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/g;
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

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
 * Pouch outline built in view space for its tract rect. A pouch fills its
 * compartment (the layout hands it the cell), so it reads as stuffing pressed
 * into the corners: a modest, constant corner radius on the SHORT side — not
 * the old compression rounding, which turned every cell-shaped rect into a
 * capsule with voids at the corners (Ivan, 26-9-2026: no gaps, fully stuffed).
 * The squeeze itself is told by the dashed stroke and the ↔ mark. A pill (the
 * Neck support) is always the full capsule — it stretches, its ends stay round.
 */
/** Corner radius of a stuffed pouch as a share of its short side. */
export const POUCH_CORNER = 0.18;
/** A pill (the Neck support) is rounder — a firm roll — yet still fills its compartment; a full half-height would erode it to a blob under the notches. */
export const PILL_CORNER = 0.35;

/** Drop points closer than `minSeg` to the last kept one: sub-unit steps whose direction is noise once rounded to 0.1. */
const thin = (pts: Pt[], minSeg: number): Pt[] => {
  const out: Pt[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= minSeg) out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 1 && Math.hypot(first[0] - last[0], first[1] - last[1]) < minSeg) out.pop();
  return out;
};

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
  // A stuffed pouch: ~18% of the short side; a pill: the full capsule.
  const r = shape === "pill" ? short / 2 : short * POUCH_CORNER;
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

const rectRing = ({ x, y, w, h }: PieceRect): Pt[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

/** Twice the signed area: the ring's orientation, whichever way it was sampled. */
const signedArea2 = (pts: Pt[]): number => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    a += x0 * y1 - x1 * y0;
  }
  return a;
};

/**
 * The ring moved `d` inward along every edge (a miter at each vertex, capped
 * at 2d so a tight corner bevels instead of spiking). Consecutive duplicates
 * are dropped first — a zero-length edge has no normal.
 */
export function insetRing(ring: Pt[], d: number): Pt[] {
  const pts = dedupe(ring);
  if (pts.length < 3 || d === 0) return pts;
  // The interior lies to the left of each edge when the signed area is
  // positive (y down): flip the normal otherwise.
  const side = signedArea2(pts) > 0 ? 1 : -1;
  const normals: Pt[] = pts.map((a, i) => {
    const b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    return [(-side * dy) / l, (side * dx) / l];
  });
  return pts.map((p, i) => {
    const nPrev = normals[(i - 1 + pts.length) % pts.length];
    const nNext = normals[i];
    let mx = nPrev[0] + nNext[0];
    let my = nPrev[1] + nNext[1];
    const ml = Math.hypot(mx, my);
    if (ml < 1e-9) return [p[0] + nNext[0] * d, p[1] + nNext[1] * d];
    mx /= ml;
    my /= ml;
    // miter length so the offset edges still meet: d / cos(θ/2), capped at 2d
    const cosHalf = mx * nNext[0] + my * nNext[1];
    const len = Math.min(d / Math.max(cosHalf, 1e-6), 2 * d);
    return [p[0] + mx * len, p[1] + my * len];
  });
}

/** Sutherland–Hodgman: the part of `subject` (any simple ring) inside the convex `clip` ring. */
export function clipToConvex(subject: Pt[], clip: Pt[]): Pt[] {
  const c = dedupe(clip);
  if (c.length < 3) return [];
  const side = signedArea2(c) > 0 ? 1 : -1;
  let out = subject;
  for (let i = 0; i < c.length && out.length > 0; i++) {
    const a = c[i];
    const b = c[(i + 1) % c.length];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const inside = (p: Pt) => side * (ex * (p[1] - a[1]) - ey * (p[0] - a[0])) >= -1e-9;
    const cross = (p: Pt, q: Pt): Pt => {
      const dx = q[0] - p[0];
      const dy = q[1] - p[1];
      const denom = ex * dy - ey * dx;
      if (Math.abs(denom) < 1e-12) return q;
      const t = (ex * (a[1] - p[1]) - ey * (a[0] - p[0])) / denom;
      return [p[0] + dx * t, p[1] + dy * t];
    };
    const next: Pt[] = [];
    for (let j = 0; j < out.length; j++) {
      const p = out[(j - 1 + out.length) % out.length];
      const q = out[j];
      const qIn = inside(q);
      const pIn = inside(p);
      if (qIn) {
        if (!pIn) next.push(cross(p, q));
        next.push(q);
      } else if (pIn) {
        next.push(cross(p, q));
      }
    }
    out = next;
  }
  return dedupe(out);
}

/** Douglas–Peucker on a closed ring: vertices within `tol` of the chord between their kept neighbours go. */
export function simplifyRing(ring: Pt[], tol: number): Pt[] {
  const pts = dedupe(ring);
  if (pts.length < 4) return pts;
  // Anchor on the two points farthest apart, then simplify each half as an open chain.
  let ai = 0;
  let bi = 0;
  let best = -1;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d2 = (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2;
      if (d2 > best) {
        best = d2;
        ai = i;
        bi = j;
      }
    }
  }
  const chain = (from: number, to: number): Pt[] => {
    const seq: Pt[] = [];
    for (let i = from; ; i = (i + 1) % pts.length) {
      seq.push(pts[i]);
      if (i === to) break;
    }
    return dp(seq, tol);
  };
  const first = chain(ai, bi);
  const second = chain(bi, ai);
  return dedupe([...first, ...second.slice(1, -1)]);
}

function dp(seq: Pt[], tol: number): Pt[] {
  if (seq.length < 3) return seq;
  const a = seq[0];
  const b = seq[seq.length - 1];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  let worst = -1;
  let at = 0;
  for (let i = 1; i < seq.length - 1; i++) {
    const p = seq[i];
    const dist = Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / len;
    if (dist > worst) {
      worst = dist;
      at = i;
    }
  }
  if (worst <= tol) return [a, b];
  return [...dp(seq.slice(0, at + 1), tol).slice(0, -1), ...dp(seq.slice(at), tol)];
}

/**
 * The pouch's outline for `rect`: the first region (the shell) inset by its
 * seam, cut down to every further region (a convex wall region, inset by its
 * seam) and to the rect, then OPENED by a disc of the pouch radius
 * (POUCH_CORNER of the short side; PILL_CORNER for a pill): every convex
 * corner rounds at that radius and nothing thinner than the pouch survives —
 * the fill under a notch or beside a seam rounds off the way stuffing does.
 * With no regions it is the rounded rect itself.
 */
export function conformPouchPath(rect: PieceRect, regions: ConformRegion[], shape: ShapeId = "pouch"): string {
  const short = Math.min(rect.w, rect.h);
  const r = short * (shape === "pill" ? PILL_CORNER : POUCH_CORNER);
  const [shell, ...walls] = regions;
  let ring: Pt[] | null = shell ? insetRing(shell.poly, shell.seam) : null;
  for (const wall of walls) {
    const clip = insetRing(wall.poly, wall.seam);
    ring = ring ? clipToConvex(ring, clip) : clip;
  }
  const own = rectRing(rect);
  ring = ring ? clipToConvex(ring, own) : own;
  if (ring.length < 3) ring = own; // a rect wholly outside its regions: draw it plain rather than nothing
  let out = openRing(ring, r);
  if (out.length < 3) out = ring;
  // The traced boundary is a staircase of cell centres: straighten it (a
  // tolerance the arcs of a small pouch survive), then round the steps off.
  out = simplifyRing(out, Math.min(0.8, r / 24));
  for (let i = 0; i < (r < 8 ? 3 : 2); i++) out = chaikin(out);
  // 0.01 precision: at 0.1 a sub-unit step on a small arc reads as a bend.
  const pts = dedupe(thin(out, Math.min(0.5, r / 12)).map(([x, y]): Pt => [r2(x), r2(y)]));
  return `M${pts.map(([x, y]) => `${x} ${y}`).join(" L")} Z`;
}

/** The run of a polygon along a horizontal (axis 0) or vertical (axis 1) line, on the side that contains `at`. */
function chord(pts: Pt[], axis: 0 | 1, level: number, at: number): [number, number] {
  const other = axis === 0 ? 1 : 0;
  const xs: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const a1 = a[other];
    const b1 = b[other];
    if (a1 === b1 || level < Math.min(a1, b1) || level >= Math.max(a1, b1)) continue;
    const t = (level - a1) / (b1 - a1);
    xs.push(a[axis] + (b[axis] - a[axis]) * t);
  }
  xs.sort((p, q) => p - q);
  let lo = -Infinity;
  let hi = Infinity;
  for (const x of xs) {
    if (x <= at) lo = x;
    else {
      hi = x;
      break;
    }
  }
  return Number.isFinite(lo) && Number.isFinite(hi) ? [lo, hi] : [at, at];
}

/**
 * Where a piece's label sits: a rect on the drawn body. A pouch that fills
 * its compartment is cut by the silhouette's notch or a wall, so its rect's
 * centre can lie off the visible body — and even the outline's area centroid
 * can sit where the body is narrow. So: from the centroid, take the
 * horizontal run of the outline through it and centre on that; then the
 * vertical run at that x; the rect is those two runs, which the label sizes
 * to. A full rectangle gives its own rect back.
 */
export function labelRectOf(d: string): PieceRect {
  const pts = parsePathPolygon(d);
  if (pts.length < 3) return { x: 0, y: 0, w: 0, h: 0 };
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
  }
  if (Math.abs(a) < 1e-6) {
    cx = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
    cy = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
  } else {
    cx /= 3 * a;
    cy /= 3 * a;
  }
  const [l0, r0] = chord(pts, 0, cy, cx);
  const mx = (l0 + r0) / 2;
  const [t1, b1] = chord(pts, 1, mx, cy);
  const my = (t1 + b1) / 2;
  const [l, r] = chord(pts, 0, my, mx);
  return { x: r1(l), y: r1(t1), w: r1(r - l), h: r1(b1 - t1) };
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
