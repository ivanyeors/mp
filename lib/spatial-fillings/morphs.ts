/**
 * Prepared flubber morphs (ADR 0009 guardrail 4): interpolators between every
 * pair of filling shapes are computed ONCE at module load — never ad hoc per
 * animation. A pair that degenerates (invalid frames, self-intersections)
 * falls back to a crossfade so the renderer never shows flicker artifacts.
 * Pure + browser-safe.
 */

import { interpolate } from "flubber";

import { FILLING_SHAPE_PATHS } from "@/components/spatial/xray-assets";
import type { ShapeId } from "./visuals";

export type PreparedMorph =
  | { interpolator: (t: number) => string; crossfade: false }
  | { interpolator: null; crossfade: true };

export type MorphKey = `${ShapeId}->${ShapeId}`;

/** Sampled mid-animation frames checked for degeneracy at prepare time. */
const SAMPLE_TS = [0.25, 0.5, 0.75];
const MAX_SEGMENT_LENGTH = 6; // on the normalized 100×100 shape box

/** Parse a flubber polygon frame ("M x,y L x,y … Z") into ring points. */
function ringPoints(d: string): Array<[number, number]> {
  const nums = d.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const pts: Array<[number, number]> = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    pts.push([Number(nums[i]), Number(nums[i + 1])]);
  }
  return pts;
}

type Pt = [number, number];

const orient = (a: Pt, b: Pt, c: Pt) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);

/** Proper crossing test (shared endpoints / collinear touches don't count). */
function segsCross(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d1 = orient(p3, p4, p1);
  const d2 = orient(p3, p4, p2);
  const d3 = orient(p1, p2, p3);
  const d4 = orient(p1, p2, p4);
  return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0;
}

/** True if the closed ring's edges properly cross anywhere (bowtie frames). */
// ponytail: O(n²) scan over ~60-pt sampled rings, 3 pairs, at load only —
// sweep-line if designer shapes ever get dense enough to matter.
export function ringSelfIntersects(pts: Pt[]): boolean {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i + 1 || (i === 0 && j === n - 1)) continue; // adjacent edges share a point
      if (segsCross(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

/**
 * Prepare one morph. Degenerate pairs — flubber throws, non-finite/empty
 * frames, or self-intersecting sampled frames — return the crossfade fallback.
 */
export function prepareMorph(fromD: string, toD: string): PreparedMorph {
  try {
    const interpolator = interpolate(fromD, toD, { maxSegmentLength: MAX_SEGMENT_LENGTH });
    for (const t of SAMPLE_TS) {
      const pts = ringPoints(interpolator(t));
      if (
        pts.length < 3 ||
        pts.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y)) ||
        ringSelfIntersects(pts)
      ) {
        return { interpolator: null, crossfade: true };
      }
    }
    return { interpolator, crossfade: false };
  } catch {
    return { interpolator: null, crossfade: true };
  }
}

/** Every ordered pair of distinct shapes, prepared once at load (reverse reuses forward via 1−t). */
export const SHAPE_MORPHS: ReadonlyMap<MorphKey, PreparedMorph> = (() => {
  const map = new Map<MorphKey, PreparedMorph>();
  const ids = Object.keys(FILLING_SHAPE_PATHS) as ShapeId[];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const fwd = prepareMorph(FILLING_SHAPE_PATHS[ids[i]], FILLING_SHAPE_PATHS[ids[j]]);
      map.set(`${ids[i]}->${ids[j]}`, fwd);
      map.set(
        `${ids[j]}->${ids[i]}`,
        fwd.crossfade ? fwd : { interpolator: (t: number) => fwd.interpolator(1 - t), crossfade: false },
      );
    }
  }
  return map;
})();

/** Morph for a shape swap; null when the shape is unchanged (nothing to animate). */
export function getShapeMorph(from: ShapeId, to: ShapeId): PreparedMorph | null {
  if (from === to) return null;
  return SHAPE_MORPHS.get(`${from}->${to}`) ?? { interpolator: null, crossfade: true };
}
