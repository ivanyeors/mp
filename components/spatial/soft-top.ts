import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { clipToConvex, parsePathPolygon, pouchOutline, type Pt as ConformPt } from "@/lib/spatial-fillings/conform";
import { createSettle, resample, ringLength, signedArea, taubin, type Pt, type SoftPiece, type SoftSettle } from "@/lib/spatial-fillings/soft-body";
import { solverOptionsFor, type SoftBodySettings } from "@/lib/spatial-fillings/soft-body-settings";
import type { ShapeId } from "@/lib/spatial-fillings/visuals";
import type { PieceRect } from "@/lib/spatial-fillings/xray-layout";
import type { StageGeometry } from "@/lib/spatial-fillings/xray-stage";
import { smoothClosedPath } from "./slab-shape";
import { morph, type SoftCutShapes } from "./soft-cut";

const RING_POINTS = 40;
const ROLL_POINTS = 36;
const TETHER = 0.05;
const ROOM = 0.88;
const AREA_FLOOR = 0.75;
const MIN_SQUEEZE = 0.5;
const SYNC_PLANES = 2;
const FRAME_BUDGET_MS = 8;
const STEP_CHUNK = 2;

export type SoftTopPiece = { key: string; d: string; rect: PieceRect; shape: ShapeId; held?: boolean; relaxedH?: number };

export type SoftTopPlane = { id: string; region: readonly Pt[]; pieces: readonly SoftTopPiece[] };

export function sectionRegion(stage: StageGeometry, section: keyof StageGeometry["sectionPolygons"]): Pt[] {
  return clipToConvex(stage.silhouettePolygon as ConformPt[], stage.sectionPolygons[section] as ConformPt[]) as Pt[];
}

export type TopPlanePiece = SoftTopPiece & { section: keyof StageGeometry["sectionPolygons"]; level: number };

export function topPlanes(stage: StageGeometry, pieces: readonly TopPlanePiece[], id: string): SoftTopPlane[] {
  const groups = new Map<string, TopPlanePiece[]>();
  for (const p of pieces) {
    const g = `${p.section}/${p.level}`;
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  return [...groups].map(([g, members]) => ({
    id: `${id}/${g}`,
    region: sectionRegion(stage, members[0].section),
    pieces: members.map(({ key, d, rect, shape, held, relaxedH }) => ({
      key,
      d,
      rect,
      shape,
      ...(held ? { held } : {}),
      ...(relaxedH !== undefined && relaxedH > rect.h + 0.05 ? { relaxedH } : {}),
    })),
  }));
}

const centroidOf = (P: readonly Pt[]): Pt => {
  let x = 0;
  let y = 0;
  for (const p of P) {
    x += p[0];
    y += p[1];
  }
  return [x / P.length, y / P.length];
};

function scaledTo(ring: readonly Pt[], area: number): Pt[] {
  const a = Math.abs(signedArea(ring));
  if (a <= 0) return ring.slice();
  const k = Math.sqrt(area / a);
  const [cx, cy] = centroidOf(ring);
  return ring.map(([x, y]): Pt => [cx + (x - cx) * k, cy + (y - cy) * k]);
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

export function startRings(plane: SoftTopPlane): Map<string, Pt[]> {
  return new Map(plane.pieces.map((p) => [p.key, resample(parsePathPolygon(p.d) as Pt[], p.shape === "pill" ? ROLL_POINTS : RING_POINTS)]));
}

export function softTopPieces(plane: SoftTopPlane, settings: SoftBodySettings): SoftPiece[] {
  const starts = startRings(plane);
  const volume = settings.volumePct / 100;
  const room = Math.abs(signedArea(plane.region)) * ROOM;
  const drawn = plane.pieces.map((p) => {
    const ring = starts.get(p.key)!;
    const area = Math.abs(signedArea(ring));
    const own = p.relaxedH !== undefined && p.relaxedH > p.rect.h ? p.relaxedH / Math.max(p.rect.h, 1) : 1;
    return { p, ring, area, ownArea: area * own };
  });
  const isFirm = (shape: ShapeId) => shape === "pill" || shape === "ear";
  const heldAcross = (rect: PieceRect) => ({ anchorX: rect.x + rect.w / 2 });
  const firm = drawn.filter((x) => isFirm(x.p.shape)).reduce((a, x) => a + x.area, 0);
  const want = drawn.filter((x) => !isFirm(x.p.shape)).reduce((a, x) => a + x.ownArea * volume, 0);
  const squeeze = want > room - firm ? Math.max((room - firm) / Math.max(want, 1), MIN_SQUEEZE) : 1;
  return drawn
    .filter((x) => x.ring.length >= 3 && x.area > 1)
    .map(({ p, ring, area, ownArea }): SoftPiece => {
      if (p.shape === "pill") {
        const own = pouchOutline(p.rect, 10, "pill") as Pt[];
        const rest = pairedWith(own, ring);
        return { id: p.key, ring, rest, kind: "roll", areaTarget: Math.abs(signedArea(own)), ...heldAcross(p.rect), ...(p.held ? { held: true } : {}) };
      }
      if (p.shape === "ear") {
        const rest = pairedWith(scaledTo(pouchOutline(p.rect, 8, "ear") as Pt[], area), ring);
        return { id: p.key, ring, rest, kind: "pad", areaTarget: area, ...heldAcross(p.rect), ...(p.held ? { held: true } : {}) };
      }
      const target = ownArea * volume * squeeze;
      const H = Math.max(p.relaxedH ?? p.rect.h, p.rect.h);
      const own = { x: p.rect.x, y: p.rect.y + (p.rect.h - H) / 2, w: p.rect.w, h: H };
      const rest = pairedWith(scaledTo(pouchOutline(own, 5, "pouch") as Pt[], target), ring);
      return { id: p.key, ring, rest, kind: "pouch", areaTarget: target, areaMin: Math.min(area * AREA_FLOOR, target), ...(p.held ? { held: true } : {}) };
    });
}

export function softTopOptions(settings: SoftBodySettings) {
  return { ...solverOptionsFor(settings, 1), gravity: 0, tetherY: TETHER, rigidCase: true };
}

function smoothRing(ring: readonly Pt[], passes: number): Pt[] {
  const n = Math.max(32, Math.round(ringLength(ring) / 5));
  return taubin(resample(ring, n), passes);
}

const planeKey = (plane: SoftTopPlane, settings: SoftBodySettings, view: { width: number; height: number }) =>
  [
    plane.id,
    `${plane.region.length}:${plane.region[0]?.join(",")}`,
    view.width,
    view.height,
    JSON.stringify(settings),
    plane.pieces.map((p) => `${p.key}:${p.shape}:${p.rect.x},${p.rect.y},${p.rect.w},${p.rect.h}:${p.relaxedH ?? ""}:${p.held ? 1 : 0}:${p.d}`).join("|"),
  ].join("#");

const settledCache = new Map<string, ReadonlyMap<string, Pt[]>>();
const CACHE_SIZE = 64;

type View = { width: number; height: number };

function startPlane(plane: SoftTopPlane, settings: SoftBodySettings, view: View): { sim: SoftSettle | null; finish: () => ReadonlyMap<string, Pt[]> } {
  const key = planeKey(plane, settings, view);
  const pieces = softTopPieces(plane, settings);
  const sim =
    pieces.length > 0 && plane.region.length >= 3
      ? createSettle(pieces, { outline: plane.region, baseline: view.height * 4, width: view.width, height: view.height }, softTopOptions(settings))
      : null;
  return {
    sim,
    finish: () => {
      const out: ReadonlyMap<string, Pt[]> = sim ? new Map(sim.snapshot().bodies.map((b) => [b.id, smoothRing(b.ring, settings.smoothing)])) : new Map();
      settledCache.delete(key);
      settledCache.set(key, out);
      if (settledCache.size > CACHE_SIZE) settledCache.delete(settledCache.keys().next().value!);
      return out;
    },
  };
}

const cachedPlane = (plane: SoftTopPlane, settings: SoftBodySettings, view: View) => settledCache.get(planeKey(plane, settings, view));

export function settleTopPlane(plane: SoftTopPlane, settings: SoftBodySettings, view: View): ReadonlyMap<string, Pt[]> {
  const hit = cachedPlane(plane, settings, view);
  if (hit) return hit;
  const run = startPlane(plane, settings, view);
  run.sim?.step(run.sim.steps);
  return run.finish();
}

export function settleTop(planes: readonly SoftTopPlane[], settings: SoftBodySettings, view: { width: number; height: number }): Map<string, Pt[]> {
  const out = new Map<string, Pt[]>();
  for (const plane of planes) for (const [key, ring] of settleTopPlane(plane, settings, view)) out.set(key, ring);
  return out;
}

const smoothedPaths = new WeakMap<readonly Pt[], string>();
function smoothedPath(ring: readonly Pt[]): string {
  let d = smoothedPaths.get(ring);
  if (d === undefined) {
    d = smoothClosedPath(ring);
    smoothedPaths.set(ring, d);
  }
  return d;
}

const noSubscribe = () => () => {};
const isClient = () => true;
const isServer = () => false;

const prefersReducedMotion = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const NO_CASE: Pt[] = [
  [0, 0],
  [1, 0],
  [0, 1],
];
const asShapes = (rings: ReadonlyMap<string, Pt[]>): SoftCutShapes => ({ case: NO_CASE, rings, labels: new Map() });

export function useSoftTopPaths(planes: readonly SoftTopPlane[] | null, settings: SoftBodySettings, view: View, easeMs?: number): ReadonlyMap<string, string> | null {
  const mounted = useSyncExternalStore(noSubscribe, isClient, isServer);
  const live = mounted && settings.enabled && planes !== null && planes.length > 0;
  const [settledMore, setSettledMore] = useState(0);
  const target = useMemo(() => {
    if (!live) return null;
    const out = new Map<string, Pt[]>();
    let settled = 0;
    for (const plane of planes!) {
      let rings = cachedPlane(plane, settings, view);
      if (!rings && settled < SYNC_PLANES) {
        rings = settleTopPlane(plane, settings, view);
        settled++;
      }
      if (rings) for (const [key, ring] of rings) out.set(key, ring);
    }
    return out.size > 0 ? out : null;
  }, [live, planes, settings, view, settledMore]);

  useEffect(() => {
    if (!live) return;
    const pending = planes!.filter((plane) => !cachedPlane(plane, settings, view));
    if (pending.length === 0) return;
    let i = 0;
    let run: ReturnType<typeof startPlane> | null = null;
    let raf = 0;
    const tick = () => {
      const t0 = performance.now();
      while (i < pending.length && performance.now() - t0 < FRAME_BUDGET_MS) {
        run ??= startPlane(pending[i], settings, view);
        if (!run.sim || run.sim.step(STEP_CHUNK)) {
          run.finish();
          run = null;
          i++;
        }
      }
      if (i < pending.length) raf = requestAnimationFrame(tick);
      else setSettledMore((n) => n + 1);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [live, planes, settings, view]);

  const [frame, setFrame] = useState<{ of: Map<string, Pt[]>; rings: ReadonlyMap<string, Pt[]> } | null>(null);
  const shown = useRef<ReadonlyMap<string, Pt[]> | null>(null);
  const planesRef = useRef(planes);
  const ease = useRef(easeMs);

  useLayoutEffect(() => {
    planesRef.current = planes;
    ease.current = easeMs;
  });

  useLayoutEffect(() => {
    const from = shown.current;
    shown.current = target;
    if (!target || !from || !settings.animate || prefersReducedMotion()) return;
    const seed = () => {
      const rings = new Map<string, Pt[]>();
      for (const plane of planesRef.current ?? []) for (const [key, ring] of startRings(plane)) rings.set(key, ring);
      return asShapes(rings);
    };
    const plan = morph(asShapes(from), asShapes(target), seed);
    const duration = ease.current ?? Math.max(200, (settings.steps * 1000) / 60);
    const t0 = performance.now();
    let raf = 0;
    const show = (rings: ReadonlyMap<string, Pt[]>) => {
      shown.current = rings;
      setFrame({ of: target, rings });
    };
    const tick = (now: number) => {
      const t = Math.min((now - t0) / duration, 1);
      if (t < 1) {
        show(plan.at(easeOutCubic(t)).rings);
        raf = requestAnimationFrame(tick);
      } else {
        shown.current = target;
        setFrame(null);
      }
    };
    show(plan.at(0).rings);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const rings = frame && frame.of === target ? frame.rings : target;
  return useMemo(() => (rings ? new Map([...rings].map(([key, ring]) => [key, smoothedPath(ring)])) : null), [rings]);
}
