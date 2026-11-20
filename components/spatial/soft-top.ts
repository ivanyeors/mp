/**
 * The top-down x-ray's soft settle (ADR 0025, extended 1-11-2026): the same
 * soft bodies the cross-section draws, seen from above. Ivan: the top view
 * should use the soft body as the side view does.
 *
 * Where each piece goes is still the layout's (`layoutPlacements`, from the
 * fit): its rect, its Layer, its squeezed width. This file only lets each
 * outline take the shape it would once the pouches press on each other and
 * on the walls. Seen from above, a Section's sewn walls do not move, gravity
 * points into the screen, and the Layers lie on top of one another, so:
 *
 * - each height of a Section's stack (from the floor, as the cut stacks it)
 *   is one plane, settled on its own: pieces at one height press on each
 *   other — side by side across, and Front, Middle and Back end to end
 *   (stuffed, 9-11-2026); a Layer under them does not push them aside;
 * - the case is the Section's own region (silhouette ∩ its column), rigid;
 * - no gravity, and each piece is held loosely both ways to where the layout
 *   put it (the cut holds it front ↔ back only, and lets gravity do the rest);
 * - a pouch remembers the codebase's own footprint (`pouchOutline`) at its own
 *   length and the volume Settings gives it, so one the settle pressed
 *   shorter between its neighbours pushes back on them; a plane holding more
 *   than its room is squeezed pro rata first, as the cut squeezes a crowded
 *   cell; a Neck support is the firm roll, its footprint the pill; an Ear
 *   Comfort Pad is a firm pad, its footprint a puffy square (its well is
 *   drawn on it by the x-ray).
 *
 * The same solver, the same Settings (rigidity, Neck and ear pad firmness, pouch volume,
 * smoothing, space between pieces, settle length, animate, on/off), the same
 * smoothing and the same easing as the cut. Empty case height is the cut's
 * alone: seen from above the case has no height to slump.
 *
 * Deterministic and cached per plane, so a change in one Section settles that
 * Section's planes alone. A whole pillow is several planes, more than the cut
 * settles at once: the first few settle in render (an edit's one or two, so it
 * never flickers), the rest a few steps per frame, which the solver's split
 * invariance makes the same picture. A static or server render draws the
 * conformed outlines; the soft ones replace them on the client.
 */

import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { clipToConvex, parsePathPolygon, pouchOutline, type Pt as ConformPt } from "@/lib/spatial-fillings/conform";
import { createSettle, resample, ringLength, signedArea, taubin, type Pt, type SoftPiece, type SoftSettle } from "@/lib/spatial-fillings/soft-body";
import { solverOptionsFor, type SoftBodySettings } from "@/lib/spatial-fillings/soft-body-settings";
import type { ShapeId } from "@/lib/spatial-fillings/visuals";
import type { PieceRect } from "@/lib/spatial-fillings/xray-layout";
import type { StageGeometry } from "@/lib/spatial-fillings/xray-stage";
import { smoothClosedPath } from "./slab-shape";
import { morph, type SoftCutShapes } from "./soft-cut";

/** Points on a ring, as in the cut. */
const RING_POINTS = 40;
const ROLL_POINTS = 36;
/** How loosely a piece is held to where the layout put it, each way (the cut's front ↔ back tether). */
const TETHER = 0.05;
/** The share of a plane's region its pieces may fill: the rest is the gaps and the margin at the walls. */
const ROOM = 0.88;
/** A pouch never squeezes below this share of the footprint it was drawn with. */
const AREA_FLOOR = 0.75;
/** A crowded plane squeezes its pouches no further than this. */
const MIN_SQUEEZE = 0.5;
/** How many unsettled planes a render settles itself (an edit's, a dive's first cell) before it leaves the rest to the frames after it. */
const SYNC_PLANES = 2;
/** How long each frame after it may spend, ms, and how many steps it takes at a time. */
const FRAME_BUDGET_MS = 8;
const STEP_CHUNK = 2;

/**
 * One piece of a plane: its conformed outline (where it starts), the rect the
 * layout gave it, its shape, whether it was nudged by hand (`held`: the settle
 * keeps it where it was put, its neighbours make room), and its own length
 * front ↔ back when its neighbours pressed it shorter (`relaxedH`, view units;
 * absent, the rect's).
 */
export type SoftTopPiece = { key: string; d: string; rect: PieceRect; shape: ShapeId; held?: boolean; relaxedH?: number };

/** One Layer of one Section (or, in the dive, of one cell): the pieces that press on each other, and the walls round them. */
export type SoftTopPlane = { id: string; region: readonly Pt[]; pieces: readonly SoftTopPiece[] };

/** The walls a settled Layer presses on, seen from above: the silhouette inside the Section's column. */
export function sectionRegion(stage: StageGeometry, section: keyof StageGeometry["sectionPolygons"]): Pt[] {
  return clipToConvex(stage.silhouettePolygon as ConformPt[], stage.sectionPolygons[section] as ConformPt[]) as Pt[];
}

/** One piece of the top view as its plane needs it: its Section, and its height in its cell's stack from the floor. */
export type TopPlanePiece = SoftTopPiece & { section: keyof StageGeometry["sectionPolygons"]; level: number };

/**
 * The top view's soft planes: one per height of each Section's stack, counted
 * from the floor as the cut stacks it, pressed into silhouette ∩ that Section
 * (Left, Center and Right are sewn apart). Stuffed, not layered (Ivan,
 * 9-11-2026: "the front filling and the back filling are supposed to
 * collide"): every piece at one height presses on every other — a cell's side
 * by side, and Front, Middle and Back end to end, where the settle stood them,
 * each pushing back for the length it was pressed out of. A pouch higher up
 * rests over its neighbour's end, as in the cut.
 */
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

/** `ring` scaled about its centroid to `area`. */
function scaledTo(ring: readonly Pt[], area: number): Pt[] {
  const a = Math.abs(signedArea(ring));
  if (a <= 0) return ring.slice();
  const k = Math.sqrt(area / a);
  const [cx, cy] = centroidOf(ring);
  return ring.map(([x, y]): Pt => [cx + (x - cx) * k, cy + (y - cy) * k]);
}

/** `ring` as `ref.length` points, turned (and, if need be, reversed) so they pair with the nearest of `ref`. */
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

/** Each piece's outline as it starts: its conformed outline, evenly spaced. */
export function startRings(plane: SoftTopPlane): Map<string, Pt[]> {
  return new Map(plane.pieces.map((p) => [p.key, resample(parsePathPolygon(p.d) as Pt[], p.shape === "pill" ? ROLL_POINTS : RING_POINTS)]));
}

/** The plane's soft pieces: where they start, what they remember and how much they hold. */
export function softTopPieces(plane: SoftTopPlane, settings: SoftBodySettings): SoftPiece[] {
  const starts = startRings(plane);
  const volume = settings.volumePct / 100;
  const room = Math.abs(signedArea(plane.region)) * ROOM;
  const drawn = plane.pieces.map((p) => {
    const ring = starts.get(p.key)!;
    const area = Math.abs(signedArea(ring));
    // Pressed shorter by its neighbours, it still holds the fill of its own length: it wants that room back.
    const own = p.relaxedH !== undefined && p.relaxedH > p.rect.h ? p.relaxedH / Math.max(p.rect.h, 1) : 1;
    return { p, ring, area, ownArea: area * own };
  });
  // A roll or an ear pad keeps its own footprint; the pouches share what room it leaves, pro rata, when they would want more.
  const isFirm = (shape: ShapeId) => shape === "pill" || shape === "ear";
  // A firm piece is held across where the layout put it, not where its clipped outline's middle is. The back wall
  // curves in at the centre Section, so a roll laid against it is clipped more on its inner side; held at what was
  // left, the wall then slid it on to the corner whatever offset it had (Ivan, 8-11-2026: a Neck support nudged to
  // the centre stuck on the side). It cannot squash to the wall as a pouch does, so the wall pushes it forward instead.
  const heldAcross = (rect: PieceRect) => ({ anchorX: rect.x + rect.w / 2 });
  const firm = drawn.filter((x) => isFirm(x.p.shape)).reduce((a, x) => a + x.area, 0);
  const want = drawn.filter((x) => !isFirm(x.p.shape)).reduce((a, x) => a + x.ownArea * volume, 0);
  const squeeze = want > room - firm ? Math.max((room - firm) / Math.max(want, 1), MIN_SQUEEZE) : 1;
  return drawn
    .filter((x) => x.ring.length >= 3 && x.area > 1)
    .map(({ p, ring, area, ownArea }): SoftPiece => {
      if (p.shape === "pill") {
        // The firm roll: it remembers the pill it is, its whole length (true size, 9-11-2026) — not shrunk to what a
        // curved wall left of its clipped outline, which drew a 150 mm roll 75 mm long; the wall pushes it forward.
        const own = pouchOutline(p.rect, 10, "pill") as Pt[];
        const rest = pairedWith(own, ring);
        return { id: p.key, ring, rest, kind: "roll", areaTarget: Math.abs(signedArea(own)), ...heldAcross(p.rect), ...(p.held ? { held: true } : {}) };
      }
      if (p.shape === "ear") {
        // The firm pad: it remembers the puffy square it was drawn as, at the footprint it has.
        const rest = pairedWith(scaledTo(pouchOutline(p.rect, 8, "ear") as Pt[], area), ring);
        return { id: p.key, ring, rest, kind: "pad", areaTarget: area, ...heldAcross(p.rect), ...(p.held ? { held: true } : {}) };
      }
      // A pouch remembers the codebase's own footprint at its own length and the volume it holds: pressed shorter
      // between its neighbours, it pushes back on them, and they on it, until they share the room.
      const target = ownArea * volume * squeeze;
      const H = Math.max(p.relaxedH ?? p.rect.h, p.rect.h);
      const own = { x: p.rect.x, y: p.rect.y + (p.rect.h - H) / 2, w: p.rect.w, h: H };
      const rest = pairedWith(scaledTo(pouchOutline(own, 5, "pouch") as Pt[], target), ring);
      return { id: p.key, ring, rest, kind: "pouch", areaTarget: target, areaMin: Math.min(area * AREA_FLOOR, target), ...(p.held ? { held: true } : {}) };
    });
}

/** The solver's options for a plane seen from above: the Settings' own, with no gravity, rigid walls and a tether both ways. */
export function softTopOptions(settings: SoftBodySettings) {
  return { ...solverOptionsFor(settings, 1), gravity: 0, tetherY: TETHER, rigidCase: true };
}

/** The drawn outlines, smoothed as the cut smooths its own. */
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

/** A plane's settle, started: step it to the end (in one go or a few steps at a time — the same picture), then `finish`. */
function startPlane(plane: SoftTopPlane, settings: SoftBodySettings, view: View): { sim: SoftSettle | null; finish: () => ReadonlyMap<string, Pt[]> } {
  const key = planeKey(plane, settings, view);
  const pieces = softTopPieces(plane, settings);
  // The baseline only pins a cloth case's bottom; the walls here are rigid, so it lies below everything.
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

/** A plane already settled, or undefined. */
const cachedPlane = (plane: SoftTopPlane, settings: SoftBodySettings, view: View) => settledCache.get(planeKey(plane, settings, view));

/** One plane settled in one go: each piece's soft outline by its key. */
export function settleTopPlane(plane: SoftTopPlane, settings: SoftBodySettings, view: View): ReadonlyMap<string, Pt[]> {
  const hit = cachedPlane(plane, settings, view);
  if (hit) return hit;
  const run = startPlane(plane, settings, view);
  run.sim?.step(run.sim.steps);
  return run.finish();
}

/** Every plane settled: each piece's soft outline by its key. */
export function settleTop(planes: readonly SoftTopPlane[], settings: SoftBodySettings, view: { width: number; height: number }): Map<string, Pt[]> {
  const out = new Map<string, Pt[]>();
  for (const plane of planes) for (const [key, ring] of settleTopPlane(plane, settings, view)) out.set(key, ring);
  return out;
}

/** A settled ring's drawn path, once per ring: a plane read from the cache hands back the same rings, so only new ones are smoothed. */
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
/** `morph` eases a case too; seen from above there is none to ease. */
const NO_CASE: Pt[] = [
  [0, 0],
  [1, 0],
  [0, 1],
];
const asShapes = (rings: ReadonlyMap<string, Pt[]>): SoftCutShapes => ({ case: NO_CASE, rings, labels: new Map() });

/**
 * The top view's outlines, soft: each piece's path by its key (a piece whose
 * plane is still settling is absent, and draws conformed), or null when the
 * soft body is off, before the first client layout (a static render draws the
 * conformed outlines) or with nothing settled yet. The first `SYNC_PLANES`
 * settle in render, so an edit or a view that flips (the dive) gets its soft
 * outlines in the same frame; the rest settles a few steps per frame and
 * arrives together. Each new settle eases every outline from where it was
 * shown — a piece not yet soft from its conformed outline — over the settle's
 * length, as the cut does — over `easeMs` instead while a pouch is held. No
 * easing when `animate` is off or the viewer asked for reduced motion.
 */
export function useSoftTopPaths(planes: readonly SoftTopPlane[] | null, settings: SoftBodySettings, view: View, easeMs?: number): ReadonlyMap<string, string> | null {
  // False on the server and while hydrating (the conformed outlines it rendered); true on the client after.
  const mounted = useSyncExternalStore(noSubscribe, isClient, isServer);
  const live = mounted && settings.enabled && planes !== null && planes.length > 0;
  // Bumped when the frames have settled what the render left: the target then reads it all from the cache.
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
    // `settledMore` re-reads the cache once the frames have filled it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, planes, settings, view, settledMore]);

  // What the render had no time for: a few steps per frame, published together.
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
  // The planes and easing length of this commit, read when a new settle starts (not deps: they do not restart it).
  // A held pouch's preview changes every pointer step: each eases quickly from where the last one was shown.
  const readLatest = useEffectEvent(() => ({ planes, easeMs }));

  useLayoutEffect(() => {
    const from = shown.current;
    shown.current = target;
    if (!target || !from || !settings.animate || prefersReducedMotion()) return;
    const latest = readLatest();
    const seed = () => {
      const rings = new Map<string, Pt[]>();
      for (const plane of latest.planes ?? []) for (const [key, ring] of startRings(plane)) rings.set(key, ring);
      return asShapes(rings);
    };
    const plan = morph(asShapes(from), asShapes(target), seed);
    const duration = latest.easeMs ?? Math.max(200, (settings.steps * 1000) / 60);
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
    // The easing restarts only for a new settle; a re-render with the same one keeps it going.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  const rings = frame && frame.of === target ? frame.rings : target;
  return useMemo(() => (rings ? new Map([...rings].map(([key, ring]) => [key, smoothedPath(ring)])) : null), [rings]);
}
