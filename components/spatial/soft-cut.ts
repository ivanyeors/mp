/**
 * The soft cut's inputs and its settle (ADR 0025): the along cut's pieces,
 * stacked gravity-first and settled as soft bodies inside a cloth case.
 *
 * Where each piece goes is the fit's — its span front ↔ back, its Layer, its
 * thickness, whether its cell closes. This file only turns that into a
 * starting stack the soft settle can relax: one Layer at a time from the back
 * panel up (the deepest Layer of a cell is its bottom), so nothing floats and
 * the stack grows from the bottom as pieces are added. Pieces in one Layer
 * share what is under them and never hold each other up; a piece over uneven
 * support drapes over it. A cell holding more than the case has room for is
 * squeezed first, pro rata by each piece's compressible range — the fit's own
 * rule; a Neck support's range is the share of its foam its firmness gives
 * (none when fully firm), and squashed it is a stadium, not a circle. An Ear
 * Comfort Pad is firm the same way at its own firmness, and is seeded and
 * remembered as its cushion with the sewn well dipping its top. Pieces
 * that share a Layer in one cell lie side by side across the pillow, behind
 * one another in this view, so they settle as one body and draw with one
 * outline.
 *
 * Deterministic, like the solver: the same fit and settings always give the
 * same picture. Settled results are kept (a small cache), so flipping back to
 * a recipe shows it settled at once.
 */

import { useLayoutEffect, useRef, useState } from "react";
import { SUB_SECTIONS, type Section, type SubSection } from "@/lib/spatial-fillings/core";
import type { PillowFit } from "@/lib/spatial-fillings/fit";
import {
  createSettle,
  labelSpot,
  resample,
  signedArea,
  smoothSnapshot,
  type Pt,
  type SettleFrame,
  type SoftPiece,
  type SoftSettle,
  type SolverOptions,
} from "@/lib/spatial-fillings/soft-body";
import { padWellOf, solverOptionsFor, type PadWell, type SoftBodySettings } from "@/lib/spatial-fillings/soft-body-settings";
import { padRing, puffyPath, shellPolygon, type SlabBox } from "./slab-shape";

/** Points on a pouch's ring. */
const RING_POINTS = 40;
const ROLL_POINTS = 36;
/** A pouch bends about as tightly as 2.5 × its thickness where what is under it is uneven. */
const BEND_RADIUS = 2.5;
const SUPPORT_STEP = 2;

/** The cut's frame, as the drawing lays it out: view units. */
export type SoftCutFrame = {
  x0: number;
  drawW: number;
  colW: number;
  /** The inside floor the pieces rest on, and the outline's flat edge under it. */
  floor: number;
  baseline: number;
  kx: number;
  ky: number;
  width: number;
  height: number;
  /** The space kept at a cell's ends, as the slabs draw it. */
  slabGap: number;
  /** This outline's width over its width in the desktop cut, where the solver was tuned: lengths and speeds scale by it. */
  scale: number;
};

export type SoftCutInput = {
  fit: PillowFit;
  section: Section;
  frame: SoftCutFrame;
  /** The sewn case outline, view units. */
  casePolygon: readonly Pt[];
  /** True for a piece drawn as a roll (a Neck support). */
  isRoll: (itemId: number) => boolean;
  /** True for a piece drawn as an Ear Comfort Pad; absent, there is none. */
  isPad?: (itemId: number) => boolean;
  settings: SoftBodySettings;
};

/** What the drawing needs: the cloth case, and each piece's outline and label spot by its key. */
export type SoftCutShapes = {
  case: Pt[];
  rings: ReadonlyMap<string, Pt[]>;
  labels: ReadonlyMap<string, { at: Pt; r: number }>;
};

type Seed = {
  id: string;
  kind: "pouch" | "roll" | "pad";
  /** Its authored cell's column, and its Layer counted from the floor. */
  col: number;
  level: number;
  x0: number;
  x1: number;
  /** Thickness (pouch) or diameter (roll) it is seeded at, view units. */
  t: number;
  /** Relaxed and minimum thickness at this Size, before any squeeze. */
  relaxed: number;
  min: number;
  /** How much of its thickness a roll or an ear pad gives up to a crowded cell (0 for a pouch, whose whole range gives). */
  give: number;
  areaTarget: number;
  areaMin: number;
  over: boolean;
  /** Nudged front ↔ back by hand: the settle holds it where it was put. */
  held?: boolean;
  ring?: Pt[];
  flat?: boolean;
  bottom?: number;
};

/**
 * A roll of relaxed diameter `d` squashed to thickness `t`: its cover does not
 * stretch, so it flattens into a stadium as long round as the relaxed circle,
 * centred on (cx, cy). Unsquashed, it is that circle.
 */
export function rollRing(cx: number, cy: number, d: number, t: number, n = ROLL_POINTS): Pt[] {
  if (t >= d) return Array.from({ length: n }, (_, k): Pt => [cx + (d / 2) * Math.cos((k / n) * 2 * Math.PI), cy + (d / 2) * Math.sin((k / n) * 2 * Math.PI)]);
  const r = t / 2;
  const h = (Math.PI * (d - t)) / 4;
  // Each end a half circle, ends included; the flats join them. The same way round as the circle.
  const end = (ox: number, a0: number) =>
    Array.from({ length: 25 }, (_, k): Pt => [cx + ox + r * Math.cos(a0 + (Math.PI * k) / 24), cy + r * Math.sin(a0 + (Math.PI * k) / 24)]);
  return resample([...end(h, -Math.PI / 2), ...end(-h, Math.PI / 2)], n);
}

/** The codebase's cushion for a box, as evenly spaced points: the rest shape a pouch remembers. */
export function cushionRing(box: SlabBox, n = RING_POINTS): Pt[] {
  return resample(shellPolygon(puffyPath(box, 1), { tx: 0, ty: 0, sx: 1, sy: 1 }) as Pt[], n);
}

const movingAverage = (a: readonly number[], h: number) =>
  a.map((_, k) => {
    let s = 0;
    let c = 0;
    for (let q = Math.max(0, k - h); q <= Math.min(a.length - 1, k + h); q++) {
      s += a[q];
      c++;
    }
    return s / c;
  });

/** The case's inside height over the middle of a span, view units. */
export function roomAt(poly: readonly Pt[], floorY: number, x0: number, x1: number, margin = 6): number {
  let sum = 0;
  let n = 0;
  for (let x = x0 + (x1 - x0) * 0.2; x <= x1 - (x1 - x0) * 0.2; x += 4) {
    let top = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (xi > x !== xj > x) {
        const y = yi + ((x - xi) * (yj - yi)) / (xj - xi);
        if (y < top) top = y;
      }
    }
    if (top < Infinity) {
      sum += floorY - top - margin;
      n++;
    }
  }
  return n ? sum / n : 0;
}

/**
 * The gravity-first stack: one level at a time from the back panel up. Pieces
 * of a level rest on what the levels under it left; where two of one level
 * overlap (a cell's pouch settled over a neighbour's), the later rests on the
 * earlier. Flat underneath, a pouch is the codebase's cushion; uneven, its
 * underside follows the support as cloth would.
 */
export function dropStack(seeds: readonly Seed[], floorY: number, x0: number, x1: number, step = SUPPORT_STEP, well: PadWell = { width: 0, depth: 0 }): Seed[] {
  const n = Math.ceil((x1 - x0) / step) + 1;
  const support = new Float64Array(n);
  const at = (x: number) => Math.min(Math.max(Math.round((x - x0) / step), 0), n - 1);
  const out: Seed[] = [];
  const levels = [...new Set(seeds.map((s) => s.level))].sort((a, b) => a - b);
  for (const level of levels) {
    const base = Float64Array.from(support);
    for (const p of seeds.filter((s) => s.level === level)) {
      const under = base;
      const top = new Float64Array(n);
      if (p.kind === "roll") {
        // Squashed, it is a stadium: flats `h` either side of the middle, ends of radius `r`.
        const r = p.t / 2;
        const h = p.t < p.relaxed ? (Math.PI * (p.relaxed - p.t)) / 4 : 0;
        const cx = (p.x0 + p.x1) / 2;
        let rest = 0;
        for (let k = at(cx - h - r * 0.6); k <= at(cx + h + r * 0.6); k++) rest = Math.max(rest, under[k]);
        const cy = floorY - rest - r;
        out.push({ ...p, ring: rollRing(cx, cy, p.relaxed, p.t) });
        for (let k = at(cx - h - r); k <= at(cx + h + r); k++) {
          const u = Math.max(Math.abs(x0 + k * step - cx) - h, 0);
          top[k] = rest + r + Math.sqrt(Math.max(r * r - u * u, 0));
        }
      } else {
        const i0 = at(p.x0);
        const i1 = at(p.x1);
        const t = p.t;
        let lo = Infinity;
        let hi = -Infinity;
        for (let k = i0; k <= i1; k++) {
          lo = Math.min(lo, under[k]);
          hi = Math.max(hi, under[k]);
        }
        if (hi - lo < 1) {
          const box = { x: p.x0, y: floorY - hi - t, w: p.x1 - p.x0, h: t };
          out.push({ ...p, flat: true, bottom: floorY - hi, ring: p.kind === "pad" ? padRing(box, well, RING_POINTS) : cushionRing(box) });
          for (let k = i0; k <= i1; k++) top[k] = hi + t;
        } else {
          // The underside a ball of the bending radius would trace, rolled along under the pouch's span, then smoothed.
          const r = Math.max(t * BEND_RADIUS, step);
          const reach = Math.ceil(r / step);
          const rolled: number[] = [];
          for (let k = i0; k <= i1; k++) {
            let c = -Infinity;
            for (let q = Math.max(i0, k - reach); q <= Math.min(i1, k + reach); q++) {
              const u = (q - k) * step;
              c = Math.max(c, under[q] + Math.sqrt(Math.max(r * r - u * u, 0)));
            }
            rolled.push(c - r);
          }
          const bottom = movingAverage(movingAverage(rolled, 3), 3).map((v, k) => Math.max(v, rolled[k] - 0.5, under[i0 + k]));
          const tp = movingAverage(bottom, Math.max(1, Math.round(t / 2 / step))).map((v) => v + t);
          const pts: Pt[] = [];
          for (let k = 0; k < tp.length; k++) pts.push([x0 + (i0 + k) * step, floorY - tp[k]]);
          for (let k = bottom.length - 1; k >= 0; k--) pts.push([x0 + (i0 + k) * step, floorY - bottom[k]]);
          // Round the corners (Chaikin), then space the points evenly.
          let ring = pts;
          for (let pass = 0; pass < 4; pass++) {
            const next: Pt[] = [];
            for (let k = 0; k < ring.length; k++) {
              const a = ring[k];
              const b = ring[(k + 1) % ring.length];
              next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
            }
            ring = next;
          }
          out.push({ ...p, ring: resample(ring, RING_POINTS) });
          tp.forEach((v, k) => (top[i0 + k] = v));
        }
      }
      // A later piece of this level that overlaps this one rests on it.
      top.forEach((v, k) => {
        if (v > 0) base[k] = Math.max(base[k], v);
        support[k] = Math.max(support[k], v);
      });
    }
  }
  return out;
}

/** The pieces, the frame and the options for one cut, plus which drawn piece follows which settled body. */
export function softCutScene(input: SoftCutInput): {
  pieces: SoftPiece[];
  frame: SettleFrame;
  options: Partial<SolverOptions>;
  bodyOf: ReadonlyMap<string, string>;
  scale: number;
} {
  const { fit, section, frame: f, casePolygon, isRoll, isPad, settings } = input;
  const well = padWellOf(settings);
  const scale = f.scale;
  const settled = new Map(fit.settle.pieces.map((p) => [p.key, p] as const));
  const pieces = fit.sections[section].pieces;

  // One body per Layer of each authored cell: its thickest piece; the rest draw with its outline.
  const groups = new Map<string, (typeof pieces)[number][]>();
  for (const p of pieces) {
    const sub = settled.get(p.key)?.subSection ?? p.spanFrom;
    const g = `${sub}/${p.depth}`;
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  const bodyOf = new Map<string, string>();
  const leaders: { piece: (typeof pieces)[number]; sub: SubSection }[] = [];
  for (const [g, members] of groups) {
    const leader = members.reduce((a, b) => (b.thicknessMm > a.thicknessMm ? b : a));
    for (const m of members) bodyOf.set(m.key, leader.key);
    leaders.push({ piece: leader, sub: g.split("/")[0] as SubSection });
  }
  // Layers counted from the floor, per authored cell: the deepest is level 0.
  const depthsOf = new Map<SubSection, number[]>();
  for (const { piece, sub } of leaders) depthsOf.set(sub, [...(depthsOf.get(sub) ?? []), piece.depth]);
  for (const d of depthsOf.values()) d.sort((a, b) => b - a);

  // The fit's settle counts Layers from the top, so it can spread a cell's bottom pouch into a neighbour that
  // holds fewer Layers — under what lies there. Gravity agrees with it only where the neighbour is empty: a
  // pouch spreads into empty columns beside its cell and no further.
  const cellMm = fit.settle.cellLengthMm;
  const occupied = new Set(leaders.map((l) => SUB_SECTIONS.indexOf(l.sub)));
  const reach = (c: number) => {
    let a = c;
    let b = c;
    while (a > 0 && !occupied.has(a - 1)) a--;
    while (b < SUB_SECTIONS.length - 1 && !occupied.has(b + 1)) b++;
    return [a * cellMm, (b + 1) * cellMm] as const;
  };

  const volume = settings.volumePct / 100;
  const neckSoftness = 1 - settings.neckFirmness / 100;
  const padSoftness = 1 - settings.earFirmness / 100;
  const seeds: Seed[] = leaders.map(({ piece, sub }) => {
    const s = settled.get(piece.key);
    const roll = isRoll(piece.itemId);
    const pad = !roll && (isPad?.(piece.itemId) ?? false);
    const [lo, hi] = reach(SUB_SECTIONS.indexOf(sub));
    // The fit rounds to 0.1 mm; a span on a cell's edge is on it exactly.
    const onEdge = (mm: number) => (Math.abs(mm - Math.round(mm / cellMm) * cellMm) < 0.15 ? Math.round(mm / cellMm) * cellMm : mm);
    const startMm = Math.max(onEdge(piece.startMm), lo);
    const endMm = Math.min(onEdge(piece.endMm), hi);
    const clamped = startMm > piece.startMm + 0.5 || endMm < piece.endMm - 0.5;
    // Held to its cell, it is as thick as it is relaxed; spread, as thin as the settle made it.
    const relaxedMm = clamped ? (s?.thicknessMm ?? piece.thicknessMm) : (s?.settledThicknessMm ?? piece.thicknessMm);
    const relaxed = Math.max(relaxedMm * f.ky, 1);
    const min = Math.min(Math.max((s?.minThicknessMm ?? relaxedMm) * f.ky, 1), relaxed);
    const lengthMm = s?.alongMm ?? piece.endMm - piece.startMm;
    // Its volume, side-on: relaxed thickness × relaxed length, whatever span it settled over.
    const areaTarget = (s?.thicknessMm ?? relaxedMm) * f.ky * lengthMm * f.kx;
    return {
      id: piece.key,
      kind: roll ? "roll" : pad ? "pad" : "pouch",
      col: SUB_SECTIONS.indexOf(sub),
      level: depthsOf.get(sub)!.indexOf(piece.depth),
      x0: f.x0 + startMm * f.kx + f.slabGap,
      x1: f.x0 + endMm * f.kx - f.slabGap,
      t: relaxed,
      relaxed,
      min,
      // A Neck support yields none of its foam when fully firm and all of it, down to fully squashed, when soft;
      // squared, so the soft end of the slider does most of it and the firm default barely moves.
      give: roll ? (relaxed - min) * neckSoftness ** 2 : pad ? (relaxed - min) * padSoftness ** 2 : 0,
      areaTarget: roll ? Math.PI * (relaxed / 2) ** 2 : areaTarget,
      areaMin: (s?.minThicknessMm ?? relaxedMm) * f.ky * lengthMm * f.kx,
      over: piece.status === "over",
      held: piece.nudged === true,
    };
  });

  // A cell holding more than the case has room for over it is squeezed first, pro rata by compressible range
  // (a roll's range is what its firmness lets it give).
  const room = new Map<number, number>();
  for (let c = 0; c < SUB_SECTIONS.length; c++) {
    room.set(c, roomAt(casePolygon, f.floor, f.x0 + c * f.colW + f.slabGap, f.x0 + (c + 1) * f.colW - f.slabGap, 6 * scale));
  }
  const firmKind = (s: Seed) => s.kind === "roll" || s.kind === "pad";
  const rangeOf = (s: Seed) => (firmKind(s) ? s.give : s.relaxed - s.min);
  for (const [c, inCol] of groupBy(seeds, (s) => s.col)) {
    const over = inCol.reduce((a, s) => a + s.relaxed, 0) - room.get(c)!;
    const range = inCol.reduce((a, s) => a + rangeOf(s), 0);
    const k = over > 0 && range > 0 ? Math.min(over / range, 1) : 0;
    for (const s of inCol) s.t = s.relaxed - k * rangeOf(s);
  }
  const stacked = dropStack(seeds, f.floor, f.x0, f.x0 + f.drawW, SUPPORT_STEP * scale, well);

  // A cell cannot remember more cushion than it has room for: there the rest shapes share the room pro rata.
  // What a roll's firmness will not give is held out of the share.
  const squeeze = new Map<number, number>();
  for (const [c, inCol] of groupBy(stacked, (s) => s.col)) {
    const want = inCol.reduce((a, s) => a + (firmKind(s) ? s.relaxed : (s.areaTarget * volume) / Math.max(s.x1 - s.x0, 1)), 0);
    const firm = inCol.filter(firmKind).reduce((a, s) => a + s.relaxed - s.give, 0);
    const r = room.get(c)!;
    squeeze.set(c, want > r ? Math.max((r - firm) / Math.max(want - firm, 1), 0.3) : 1);
  }
  const shaped: SoftPiece[] = stacked.map((s) => {
    if (s.kind === "roll") {
      // It remembers round, or, squeezed, the stadium its share of the room leaves it, and that much foam.
      const t = s.relaxed - s.give * (1 - (squeeze.get(s.col) ?? 1));
      if (t >= s.relaxed) return { id: s.id, ring: s.ring!, kind: "roll", over: s.over };
      const at = s.ring!.reduce((a, p) => [a[0] + p[0] / s.ring!.length, a[1] + p[1] / s.ring!.length], [0, 0]);
      const rest = pairedWith(rollRing(at[0], at[1], s.relaxed, t), s.ring!);
      return { id: s.id, ring: s.ring!, rest, kind: "roll", areaTarget: Math.abs(signedArea(rest)), over: s.over };
    }
    if (s.kind === "pad") {
      // It remembers its rim and its well, as thick as its share of the room lets it be, and that much fill.
      const t = s.relaxed - s.give * (1 - (squeeze.get(s.col) ?? 1));
      const bottom = s.flat ? s.bottom! : Math.max(...s.ring!.map((p) => p[1]));
      const rest = pairedWith(padRing({ x: s.x0, y: bottom - t, w: s.x1 - s.x0, h: t }, well, s.ring!.length), s.ring!);
      return { id: s.id, ring: s.ring!, rest, kind: "pad", areaTarget: Math.abs(signedArea(rest)), over: s.over };
    }
    const target = s.areaTarget * volume * (squeeze.get(s.col) ?? 1);
    // The relaxed cushion it remembers: its span, as thick as its volume makes it, resting where it was seeded.
    // The relaxed cushion it remembers: its span, as thick as its volume makes it. A pouch stacked over
    // something uneven remembers a cushion too, not the drape it started in, so it settles onto what is
    // under it instead of holding a tent over it.
    const w = s.x1 - s.x0;
    const bottom = s.flat ? s.bottom! : Math.max(...s.ring!.map((p) => p[1]));
    let h = target / w;
    h *= target / Math.abs(signedArea(cushionRing({ x: s.x0, y: bottom - h, w, h })));
    const cushion = cushionRing({ x: s.x0, y: bottom - h, w, h });
    const rest = s.flat ? cushion : pairedWith(cushion, s.ring!);
    return { id: s.id, ring: s.ring!, rest, kind: "pouch", areaTarget: target, areaMin: s.areaMin, over: s.over };
  });
  // A pouch nudged by hand stays where it was put; its neighbours make room.
  const softPieces = shaped.map((p, i) => (stacked[i].held ? { ...p, held: true } : p));
  return {
    pieces: softPieces,
    frame: { outline: casePolygon, baseline: f.baseline, width: f.width, height: f.height + 40 },
    options: solverOptionsFor(settings, scale),
    bodyOf,
    scale,
  };
}

/** `ring` turned (and, if need be, reversed) so its points pair with the nearest of `ref`: the same count, the same way round. */
function pairedWith(ring: readonly Pt[], ref: readonly Pt[]): Pt[] {
  const n = ref.length;
  const A = resample(ring, n);
  if (Math.sign(signedArea(A)) !== Math.sign(signedArea(ref))) A.reverse();
  let best = 0;
  let bestD = Infinity;
  for (let o = 0; o < n; o++) {
    let d = 0;
    for (let i = 0; i < n && d < bestD; i++) d += (A[(i + o) % n][0] - ref[i][0]) ** 2 + (A[(i + o) % n][1] - ref[i][1]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = o;
    }
  }
  return A.map((_, i) => A[(i + best) % n]);
}

function groupBy<T, K>(list: readonly T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const t of list) m.set(key(t), [...(m.get(key(t)) ?? []), t]);
  return m;
}

/** The drawing's shapes from a solver snapshot: smoothed, and handed to every piece that follows a body. */
function shapesOf(scene: ReturnType<typeof softCutScene>, sim: SoftSettle, input: SoftCutInput): SoftCutShapes {
  const snap = smoothSnapshot(sim.snapshot(), { baseline: input.frame.baseline, spacing: 5 * scene.scale, passes: input.settings.smoothing });
  const byBody = new Map(snap.bodies.map((b) => [b.id, b.ring] as const));
  const rings = new Map<string, Pt[]>();
  const labels = new Map<string, { at: Pt; r: number }>();
  const spots = new Map<string, { at: Pt; r: number }>();
  for (const [key, body] of scene.bodyOf) {
    const ring = byBody.get(body);
    if (!ring) continue;
    rings.set(key, ring);
    if (!spots.has(body)) spots.set(body, labelSpot(ring));
    labels.set(key, spots.get(body)!);
  }
  return { case: snap.case, rings, labels };
}

/** A stable key for everything the settle reads. */
export function softCutKey(input: SoftCutInput): string {
  const { fit, section, frame: f, settings } = input;
  const r = (n: number) => Math.round(n * 100) / 100;
  const pieces = fit.sections[section].pieces.map((p) => `${p.key}:${p.itemId}:${p.depth}:${r(p.startMm)}:${r(p.endMm)}:${r(p.thicknessMm)}:${p.status}:${input.isRoll(p.itemId) ? 1 : input.isPad?.(p.itemId) ? 2 : 0}${p.nudged ? ":held" : ""}`);
  const settled = fit.settle.pieces.filter((p) => p.section === section).map((p) => `${p.key}:${r(p.thicknessMm)}:${r(p.minThicknessMm)}:${r(p.alongMm)}:${r(p.settledThicknessMm)}`);
  const outline = input.casePolygon;
  return [
    section,
    fit.size,
    [f.x0, f.drawW, f.colW, f.floor, f.baseline, f.kx, f.ky, f.width, f.height].map(r).join(","),
    `${outline.length}:${r(outline[0]?.[0] ?? 0)}:${r(outline[0]?.[1] ?? 0)}`,
    JSON.stringify(settings),
    pieces.join("|"),
    settled.join("|"),
  ].join("#");
}

const settledCache = new Map<string, SoftCutShapes>();
const CACHE_SIZE = 24;
function remember(key: string, shapes: SoftCutShapes) {
  settledCache.delete(key);
  settledCache.set(key, shapes);
  if (settledCache.size > CACHE_SIZE) settledCache.delete(settledCache.keys().next().value!);
}

/** The cut settled in one go (no animation): what a reduced-motion viewer, a drag preview and a test see. */
export function settleSoftCut(input: SoftCutInput): SoftCutShapes {
  const key = softCutKey(input);
  const hit = settledCache.get(key);
  if (hit) return hit;
  const scene = softCutScene(input);
  const sim = createSettle(scene.pieces, scene.frame, scene.options);
  sim.step(sim.steps);
  const shapes = shapesOf(scene, sim, input);
  remember(key, shapes);
  return shapes;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The pieces as first stacked, before they settle: where a new piece eases in from. */
export function seedShapes(input: SoftCutInput): SoftCutShapes {
  const scene = softCutScene(input);
  return shapesOf(scene, createSettle(scene.pieces, scene.frame, scene.options), input);
}

/** Two closed outlines as `n` points each, the first turned so its points pair with the nearest of the second. */
function paired(a: readonly Pt[], b: readonly Pt[], n: number): [Pt[], Pt[]] {
  const B = resample(b, n);
  return [pairedWith(a, B), B];
}

type Morph = { at: (t: number) => SoftCutShapes };

/** Every outline eased from where it is shown (or, new, from where it was stacked) to where it settles. */
export function morph(from: SoftCutShapes, to: SoftCutShapes, seed: () => SoftCutShapes): Morph {
  let seeded: SoftCutShapes | null = null;
  const start = (key: string) => from.rings.get(key) ?? (seeded ??= seed()).rings.get(key);
  const startLabel = (key: string) => from.labels.get(key) ?? (seeded ??= seed()).labels.get(key);
  const n = (a: readonly Pt[], b: readonly Pt[]) => Math.max(a.length, b.length);
  const [caseA, caseB] = paired(from.case, to.case, n(from.case, to.case));
  // Pieces drawn with one outline (side by side in a Layer) share it here too.
  const byRing = new Map<Pt[], [Pt[], Pt[]]>();
  const rings = [...to.rings].map(([key, ring]) => {
    const a = start(key) ?? ring;
    if (!byRing.has(ring)) byRing.set(ring, paired(a, ring, n(a, ring)));
    return [key, byRing.get(ring)!] as const;
  });
  const labels = [...to.labels].map(([key, l]) => [key, startLabel(key) ?? l, l] as const);
  const mix = (p: Pt, q: Pt, t: number): Pt => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  return {
    at: (t) => {
      const frames = new Map<[Pt[], Pt[]], Pt[]>();
      const ringAt = (pair: [Pt[], Pt[]]) => {
        if (!frames.has(pair)) frames.set(pair, pair[0].map((p, i) => mix(p, pair[1][i], t)));
        return frames.get(pair)!;
      };
      return {
        case: caseA.map((p, i) => mix(p, caseB[i], t)),
        rings: new Map(rings.map(([key, pair]) => [key, ringAt(pair)])),
        labels: new Map(labels.map(([key, a, b]) => [key, { at: mix(a.at, b.at, t), r: a.r + (b.r - a.r) * t }])),
      };
    },
  };
}

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;

/**
 * The soft cut's shapes for a drawing, or null until the first client layout
 * (a server or static render draws the rounded slabs). The settle is computed
 * in one go (and cached); a change is shown by easing every outline from
 * where it is to where it settles — a new piece from where it was stacked —
 * over the settle's length, so no in-between frame is ever a half-solved,
 * wobbly shape. No easing when `animate` is off or the viewer asked for
 * reduced motion. Bumping `replay` eases in again from the stack. `easeMs`
 * shortens the easing while a pouch is held (a preview per pointer step).
 */
export function useSoftCut(input: SoftCutInput | null, animate: boolean, replay = 0, easeMs?: number): SoftCutShapes | null {
  const key = input ? softCutKey(input) : null;
  const [state, setState] = useState<{ key: string; shapes: SoftCutShapes } | null>(null);
  const latest = useRef(input);
  // A held pouch's preview changes every pointer step: each eases quickly from where the last one was shown.
  const ease = useRef(easeMs);
  useLayoutEffect(() => {
    ease.current = easeMs;
  });
  const replayed = useRef(replay);
  const shown = useRef<SoftCutShapes | null>(null);

  useLayoutEffect(() => {
    latest.current = input;
  });

  useLayoutEffect(() => {
    const cur = latest.current;
    if (!key || !cur) return;
    const fresh = replayed.current !== replay;
    replayed.current = replay;
    const target = settleSoftCut(cur);
    const show = (shapes: SoftCutShapes) => {
      shown.current = shapes;
      setState({ key, shapes });
    };
    if (!animate || prefersReducedMotion() || (!fresh && shown.current === target)) {
      show(target);
      return;
    }
    const plan = morph(fresh || !shown.current ? seedShapes(cur) : shown.current, target, () => seedShapes(cur));
    const duration = !fresh && ease.current !== undefined ? ease.current : Math.max(200, (cur.settings.steps * 1000) / 60);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min((now - t0) / duration, 1);
      show(t < 1 ? plan.at(easeOutCubic(t)) : target);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    show(plan.at(0));
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [key, animate, replay]);

  // Shapes settled for another recipe never draw over this one's pieces.
  return state && state.key === key ? state.shapes : null;
}
