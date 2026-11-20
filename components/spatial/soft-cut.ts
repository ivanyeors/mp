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

const RING_POINTS = 40;
const ROLL_POINTS = 36;
const BEND_RADIUS = 2.5;
const SUPPORT_STEP = 2;

export type SoftCutFrame = {
  x0: number;
  drawW: number;
  colW: number;
  floor: number;
  baseline: number;
  kx: number;
  ky: number;
  width: number;
  height: number;
  slabGap: number;
  scale: number;
};

export type SoftCutInput = {
  fit: PillowFit;
  section: Section;
  frame: SoftCutFrame;
  casePolygon: readonly Pt[];
  isRoll: (itemId: number) => boolean;
  isPad?: (itemId: number) => boolean;
  settings: SoftBodySettings;
};

export type SoftCutShapes = {
  case: Pt[];
  rings: ReadonlyMap<string, Pt[]>;
  labels: ReadonlyMap<string, { at: Pt; r: number }>;
};

export type Seed = {
  id: string;
  kind: "pouch" | "roll" | "pad";
  col: number;
  level: number;
  x0: number;
  x1: number;
  t: number;
  relaxed: number;
  min: number;
  give: number;
  areaTarget: number;
  areaMin: number;
  over: boolean;
  own: number;
  held?: boolean;
  ring?: Pt[];
  flat?: boolean;
  bottom?: number;
};

export function rollRing(cx: number, cy: number, d: number, t: number, n = ROLL_POINTS): Pt[] {
  if (t >= d) return Array.from({ length: n }, (_, k): Pt => [cx + (d / 2) * Math.cos((k / n) * 2 * Math.PI), cy + (d / 2) * Math.sin((k / n) * 2 * Math.PI)]);
  const r = t / 2;
  const h = (Math.PI * (d - t)) / 4;
  const end = (ox: number, a0: number) =>
    Array.from({ length: 25 }, (_, k): Pt => [cx + ox + r * Math.cos(a0 + (Math.PI * k) / 24), cy + r * Math.sin(a0 + (Math.PI * k) / 24)]);
  return resample([...end(h, -Math.PI / 2), ...end(-h, Math.PI / 2)], n);
}

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
      top.forEach((v, k) => {
        support[k] = Math.max(support[k], v);
      });
    }
  }
  return out;
}

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
  const depthsOf = new Map<SubSection, number[]>();
  for (const { piece, sub } of leaders) depthsOf.set(sub, [...(depthsOf.get(sub) ?? []), piece.depth]);
  for (const d of depthsOf.values()) d.sort((a, b) => b - a);

  const cellMm = fit.settle.cellLengthMm;
  const sectionMm = cellMm * SUB_SECTIONS.length;

  const volume = settings.volumePct / 100;
  const neckSoftness = 1 - settings.neckFirmness / 100;
  const padSoftness = 1 - settings.earFirmness / 100;
  const seeds: Seed[] = leaders.map(({ piece, sub }) => {
    const s = settled.get(piece.key);
    const roll = isRoll(piece.itemId);
    const pad = !roll && (isPad?.(piece.itemId) ?? false);
    const [lo, hi] = [0, sectionMm];
    const onEdge = (mm: number) => (Math.abs(mm - Math.round(mm / cellMm) * cellMm) < 0.15 ? Math.round(mm / cellMm) * cellMm : mm);
    const startMm = Math.max(onEdge(piece.startMm), lo);
    const endMm = Math.min(onEdge(piece.endMm), hi);
    const clamped = startMm > piece.startMm + 0.5 || endMm < piece.endMm - 0.5;
    const relaxedMm = clamped ? (s?.thicknessMm ?? piece.thicknessMm) : (s?.settledThicknessMm ?? piece.thicknessMm);
    const relaxed = Math.max(relaxedMm * f.ky, 1);
    const min = Math.min(Math.max((s?.minThicknessMm ?? relaxedMm) * f.ky, 1), relaxed);
    const lengthMm = s?.alongMm ?? piece.endMm - piece.startMm;
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
      give: roll ? (relaxed - min) * neckSoftness ** 2 : pad ? (relaxed - min) * padSoftness ** 2 : 0,
      areaTarget: roll ? Math.PI * (relaxed / 2) ** 2 : areaTarget,
      areaMin: (s?.minThicknessMm ?? relaxedMm) * f.ky * lengthMm * f.kx,
      over: piece.status === "over",
      own: Math.max(lengthMm * f.kx - 2 * f.slabGap, endMm * f.kx - startMm * f.kx - 2 * f.slabGap, 1),
      held: piece.nudged === true,
    };
  });

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
  rollRoom(seeds, 2 * f.slabGap + 1);
  const stacked = dropStack(seeds, f.floor, f.x0, f.x0 + f.drawW, SUPPORT_STEP * scale, well);

  const squeeze = new Map<number, number>();
  for (const [c, inCol] of groupBy(stacked, (s) => s.col)) {
    const want = inCol.reduce((a, s) => a + (firmKind(s) ? s.relaxed : (s.areaTarget * volume) / Math.max(s.x1 - s.x0, 1)), 0);
    const firm = inCol.filter(firmKind).reduce((a, s) => a + s.relaxed - s.give, 0);
    const r = room.get(c)!;
    squeeze.set(c, want > r ? Math.max((r - firm) / Math.max(want - firm, 1), 0.3) : 1);
  }
  const shaped: SoftPiece[] = stacked.map((s) => {
    if (s.kind === "roll") {
      const t = s.relaxed - s.give * (1 - (squeeze.get(s.col) ?? 1));
      if (t >= s.relaxed) return { id: s.id, ring: s.ring!, kind: "roll", over: s.over };
      const at = s.ring!.reduce((a, p) => [a[0] + p[0] / s.ring!.length, a[1] + p[1] / s.ring!.length], [0, 0]);
      const rest = pairedWith(rollRing(at[0], at[1], s.relaxed, t), s.ring!);
      return { id: s.id, ring: s.ring!, rest, kind: "roll", areaTarget: Math.abs(signedArea(rest)), over: s.over };
    }
    if (s.kind === "pad") {
      const t = s.relaxed - s.give * (1 - (squeeze.get(s.col) ?? 1));
      const bottom = s.flat ? s.bottom! : Math.max(...s.ring!.map((p) => p[1]));
      const rest = pairedWith(padRing({ x: s.x0, y: bottom - t, w: s.x1 - s.x0, h: t }, well, s.ring!.length), s.ring!);
      return { id: s.id, ring: s.ring!, rest, kind: "pad", areaTarget: Math.abs(signedArea(rest)), over: s.over };
    }
    const target = s.areaTarget * volume * (squeeze.get(s.col) ?? 1);
    const span = s.x1 - s.x0;
    const w = Math.max(s.own, span);
    const x = (s.x0 + s.x1) / 2 - w / 2;
    const bottom = s.flat ? s.bottom! : Math.max(...s.ring!.map((p) => p[1]));
    let h = target / w;
    h *= target / Math.abs(signedArea(cushionRing({ x, y: bottom - h, w, h })));
    const cushion = cushionRing({ x, y: bottom - h, w, h });
    const rest = s.flat && w === span ? cushion : pairedWith(cushion, s.ring!);
    return { id: s.id, ring: s.ring!, rest, kind: "pouch", areaTarget: target, areaMin: s.areaMin, over: s.over };
  });
  const softPieces = shaped.map((p, i) => (stacked[i].held ? { ...p, held: true } : p));
  return {
    pieces: softPieces,
    frame: { outline: casePolygon, baseline: f.baseline, width: f.width, height: f.height + 40 },
    options: solverOptionsFor(settings, scale),
    bodyOf,
    scale,
  };
}

export function rollRoom(seeds: Seed[], touch: number): void {
  const drawnOf = (r: Seed) => (r.kind !== "roll" ? r.x1 - r.x0 : r.t >= r.relaxed ? r.relaxed : r.t + (Math.PI * (r.relaxed - r.t)) / 2);
  const narrow = (r: Seed) => r.kind === "roll" && r.x1 - r.x0 - drawnOf(r) >= 1;
  for (const level of new Set(seeds.filter(narrow).map((s) => s.level))) {
    const row = seeds.filter((s) => s.level === level).sort((a, b) => a.x0 - b.x0);
    const runs: Seed[][] = [];
    for (const s of row) {
      const run = runs[runs.length - 1];
      if (run && Math.abs(s.x0 - run[run.length - 1].x1) <= touch) run.push(s);
      else runs.push([s]);
    }
    for (const run of runs) {
      if (run.length < 2 || !run.some(narrow)) continue;
      const pouches = run.filter((s) => s.kind === "pouch");
      const pressed = pouches.some((s) => s.x1 - s.x0 < s.own - 1);
      const held = run.some((s) => s.held);
      if (!pressed || held) {
        for (const [i, r] of run.entries()) {
          if (!narrow(r)) continue;
          const spare = r.x1 - r.x0 - drawnOf(r);
          const before = i > 0 ? run[i - 1] : null;
          const after = i < run.length - 1 ? run[i + 1] : null;
          if (pressed) {
            if (before) before.x1 += spare / 2;
            if (after) after.x0 -= spare / 2;
            r.x0 += spare / 2;
            r.x1 -= spare / 2;
          } else if (!r.held && before && !after) r.x1 = r.x0 + drawnOf(r);
          else if (!r.held && after && !before) r.x0 = r.x1 - drawnOf(r);
        }
        continue;
      }
      const seams = run.slice(1).map((s, i) => s.x0 - run[i].x1);
      const room = run[run.length - 1].x1 - run[0].x0 - seams.reduce((t, g) => t + g, 0);
      const firm = run.filter((s) => s.kind !== "pouch").reduce((t, s) => t + drawnOf(s), 0);
      const own = pouches.reduce((t, s) => t + s.own, 0);
      const ratio = own > 0 ? Math.min(Math.max((room - firm) / own, 0.2), 1) : 1;
      const widths = run.map((s) => (s.kind === "pouch" ? s.own * ratio : drawnOf(s)));
      let at = run[0].x0;
      run.forEach((s, i) => {
        s.x0 = at;
        s.x1 = at + widths[i];
        at = s.x1 + (seams[i] ?? 0);
      });
    }
  }
}

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

export function seedShapes(input: SoftCutInput): SoftCutShapes {
  const scene = softCutScene(input);
  return shapesOf(scene, createSettle(scene.pieces, scene.frame, scene.options), input);
}

function paired(a: readonly Pt[], b: readonly Pt[], n: number): [Pt[], Pt[]] {
  const B = resample(b, n);
  return [pairedWith(a, B), B];
}

type Morph = { at: (t: number) => SoftCutShapes };

export function morph(from: SoftCutShapes, to: SoftCutShapes, seed: () => SoftCutShapes): Morph {
  let seeded: SoftCutShapes | null = null;
  const start = (key: string) => from.rings.get(key) ?? (seeded ??= seed()).rings.get(key);
  const startLabel = (key: string) => from.labels.get(key) ?? (seeded ??= seed()).labels.get(key);
  const n = (a: readonly Pt[], b: readonly Pt[]) => Math.max(a.length, b.length);
  const [caseA, caseB] = paired(from.case, to.case, n(from.case, to.case));
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

export function useSoftCut(input: SoftCutInput | null, animate: boolean, replay = 0, easeMs?: number): SoftCutShapes | null {
  const key = input ? softCutKey(input) : null;
  const [state, setState] = useState<{ key: string; shapes: SoftCutShapes } | null>(null);
  const latest = useRef(input);
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

  return state && state.key === key ? state.shapes : null;
}
