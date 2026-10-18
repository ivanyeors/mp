/**
 * Soft cut (ADR 0025): the cross-section's pieces drawn as soft bodies, and
 * the case as cloth. Display only — the fit model still decides where every
 * piece goes and whether the cell closes; this decides only the shape each
 * outline takes once the pieces press on each other and on the case.
 *
 * Position-based dynamics (XPBD, many small substeps of one iteration each):
 * - a pouch is a ring of fixed-length fabric around its fill: pressure (an
 *   area constraint, compliance scaled by size so every pouch pushes alike,
 *   never below its minimum) holds the volume, surface tension smooths the
 *   skin, and a weak shape memory (linear, area-normalised, rotation-free
 *   shape matching toward the codebase's own cushion) keeps it a cushion;
 * - a Neck support is a firm roll: foam in a cover that does not stretch, so
 *   it keeps its round side view but gives a little — flattening where it
 *   rests and where it is pressed — the less the firmer it is;
 * - the case is cloth: never longer than sewn, drawn lightly toward a slumped
 *   copy of the sewn outline, keeping its curves and bending smoothly, and
 *   never past the sewn outline (a signed-distance limit). Its flat bottom is
 *   pinned — the pillow lies on it;
 * - contacts keep a gap between pieces (each stays countable) and a margin
 *   inside the case; a piece in a cell that cannot close may poke through.
 *
 * Deterministic: a fixed start, a fixed number of steps, no randomness and no
 * trig inside the loop, so the same recipe always settles to the same
 * picture on every device, however the steps are split. Pure + browser-safe.
 */

export type Pt = [number, number];

export type SoftPiece = {
  id: string;
  /** Where it starts, view units. */
  ring: readonly Pt[];
  /** The relaxed cushion it remembers (same point count and order as `ring`); absent = its start. */
  rest?: readonly Pt[];
  kind: "pouch" | "roll";
  /** The area it inflates to, view units²; absent = its rest area. */
  areaTarget?: number;
  /** It never squeezes below this area. */
  areaMin?: number;
  /** Its cell cannot close: it may poke through the case. */
  over?: boolean;
};

export type SolverOptions = {
  /** Settle length: steps of 1/60 s, each split in `substeps`. */
  steps: number;
  substeps: number;
  /** How high the empty case stands, as a share of the sewn height. */
  slump: number;
  /** Points on the case cloth. */
  caseN: number;
  /** Space kept between pieces, and between a piece and the case, view units. */
  gap: number;
  margin: number;
  gravity: number;
  /** How loosely a piece is held front ↔ back to where the fit put it. */
  tether: number;
  /** Pressure softness (scaled by the piece's size). */
  areaCompliance: number;
  /** Share of the settle over which pouches inflate from their seed to their volume. */
  inflate: number;
  /** Surface tension of a pouch's skin. */
  skin: number;
  /** Pull toward the rest cushion. */
  shapeMemory: number;
  /** The case keeps its sewn curves (Laplacian detail) and bends smoothly (points two apart). */
  caseDetail: number;
  caseBend: number;
  /** Pull of the case toward its slumped rest. */
  casePull: number;
  /** How far past the sewn outline the cloth may billow, view units. */
  billow: number;
  /** Cap on a pressure move per substep, view units. */
  maxStep: number;
  fabricCompliance: number;
  /** A Neck support's firmness, 0 … 1: how little its foam gives where it is pressed. */
  rollFirmness: number;
};

export const SOLVER_DEFAULTS: SolverOptions = {
  steps: 24,
  substeps: 5,
  slump: 0.38,
  caseN: 120,
  gap: 3.5,
  margin: 4,
  gravity: 600,
  tether: 0.05,
  areaCompliance: 0.008,
  inflate: 0.6,
  skin: 0.2,
  shapeMemory: 0.04,
  caseDetail: 0.12,
  caseBend: 0.25,
  casePull: 0.002,
  billow: 1.5,
  maxStep: 1.2,
  fabricCompliance: 2e-6,
  rollFirmness: 0.75,
};

export type SettleFrame = {
  /** The sewn case outline, view units. */
  outline: readonly Pt[];
  /** The y the pillow lies on; case points on it are pinned. */
  baseline: number;
  width: number;
  height: number;
};

export type SoftSnapshot = { case: Pt[]; bodies: { id: string; ring: Pt[] }[] };

export type SoftSettle = {
  steps: number;
  readonly stepsDone: number;
  /** Advance up to `n` steps; true once settled. */
  step(n?: number): boolean;
  snapshot(): SoftSnapshot;
};

export const signedArea = (P: readonly Pt[]): number => {
  let s = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const b = P[(i + 1) % P.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
};

export const ringLength = (P: readonly Pt[]): number => {
  let l = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i];
    const b = P[(i + 1) % P.length];
    l += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return l;
};

/** A closed outline as `n` points evenly spaced along it. */
export function resample(poly: readonly Pt[], n: number): Pt[] {
  const segs: [Pt, Pt, number][] = [];
  let total = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    segs.push([a, b, l]);
    total += l;
  }
  const out: Pt[] = [];
  let si = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (si < segs.length - 1 && acc + segs[si][2] < target) {
      acc += segs[si][2];
      si++;
    }
    const [a, b, l] = segs[si];
    const u = l > 0 ? (target - acc) / l : 0;
    out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
  }
  return out;
}

export function pointInPolygon(P: readonly Pt[], x: number, y: number): boolean {
  let ins = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i];
    const [xj, yj] = P[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

export function distanceToPolygon(P: readonly Pt[], x: number, y: number): number {
  let d = Infinity;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, ay] = P[j];
    const [bx, by] = P[i];
    const ex = bx - ax;
    const ey = by - ay;
    const l2 = ex * ex + ey * ey;
    let t = l2 ? ((x - ax) * ex + (y - ay) * ey) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const q = Math.hypot(x - ax - t * ex, y - ay - t * ey);
    if (q < d) d = q;
  }
  return d;
}

/** The sewn outline as a signed-distance grid (negative inside), sampled bilinearly. Cached per outline. */
const sdfCache = new Map<string, (x: number, y: number) => number>();
function sdfFor(P: readonly Pt[], width: number, height: number, step = 3) {
  const mid = P[(P.length / 2) | 0];
  const key = `${P.length}|${P[0][0].toFixed(2)}|${P[0][1].toFixed(2)}|${mid[0].toFixed(2)}|${mid[1].toFixed(2)}|${width}|${height}`;
  const hit = sdfCache.get(key);
  if (hit) return hit;
  const gw = Math.ceil(width / step) + 1;
  const gh = Math.ceil(height / step) + 1;
  const g = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const x = i * step;
      const y = j * step;
      const d = distanceToPolygon(P, x, y);
      g[j * gw + i] = pointInPolygon(P, x, y) ? -d : d;
    }
  }
  const at = (x: number, y: number) => {
    const fx = Math.min(Math.max(x / step, 0), gw - 1.001);
    const fy = Math.min(Math.max(y / step, 0), gh - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const u = fx - i;
    const v = fy - j;
    return (
      (g[j * gw + i] * (1 - u) + g[j * gw + i + 1] * u) * (1 - v) +
      (g[(j + 1) * gw + i] * (1 - u) + g[(j + 1) * gw + i + 1] * u) * v
    );
  };
  if (sdfCache.size > 16) sdfCache.clear();
  sdfCache.set(key, at);
  return at;
}

type Body = {
  kind: "case" | "pouch" | "roll";
  id: string;
  start: number;
  n: number;
  /** Rest edge lengths, rest offsets from the rest centroid, rest Laplacian. */
  rest: Float64Array;
  qx: Float64Array;
  qy: Float64Array;
  lx: Float64Array;
  ly: Float64Array;
  cx0: number;
  seedArea: number;
  target: number;
  areaMin: number;
  area0: number;
  over: boolean;
  gx: Float64Array;
  gy: Float64Array;
  box: Float64Array;
};

/** Start a settle of `pieces` inside the case. Nothing moves until `step`. */
export function createSettle(pieces: readonly SoftPiece[], frame: SettleFrame, options: Partial<SolverOptions> = {}): SoftSettle {
  const o: SolverOptions = { ...SOLVER_DEFAULTS, ...options };
  const { steps, substeps, gap, margin, gravity, tether, areaCompliance, inflate, skin, shapeMemory, caseDetail, caseBend, casePull, billow, maxStep, fabricCompliance, rollFirmness } = o;
  // Foam, not air: a roll's volume gives under load (never below its floor) and it springs back to round.
  const rollGive = areaCompliance * 6 * (1 - rollFirmness);
  const rollMemory = 0.06 + 0.24 * rollFirmness;
  const rollFloor = 0.8 + 0.16 * rollFirmness;
  // How far it may squash out of round, linearly: none at all when fully firm.
  const rollBeta = 0.85 * (1 - rollFirmness);
  const { baseline } = frame;
  const raw = resample(frame.outline, o.caseN);
  const full = signedArea(raw) < 0 ? raw.slice().reverse() : raw;
  const sdf = sdfFor(full, frame.width, frame.height);
  const slumped = full.map(([x, y]): Pt => [x, baseline - (baseline - y) * o.slump]);

  // Every ring runs the same way round; a piece's rest ring follows its start ring.
  const rings = [
    { id: "case", kind: "case" as const, pts: full as readonly Pt[], restPts: null as readonly Pt[] | null, areaTarget: undefined as number | undefined, areaMin: 0, over: false },
    ...pieces.map((p) => {
      const flip = signedArea(p.ring) < 0;
      const or = (r: readonly Pt[]) => (flip ? r.slice().reverse() : r);
      return {
        id: p.id,
        kind: p.kind,
        pts: or(p.ring),
        restPts: p.rest && p.rest.length === p.ring.length ? or(p.rest) : null,
        areaTarget: p.areaTarget,
        areaMin: p.areaMin ?? 0,
        over: !!p.over,
      };
    }),
  ];
  const N = rings.reduce((s, r) => s + r.pts.length, 0);
  const X = new Float64Array(N);
  const Y = new Float64Array(N);
  const PX = new Float64Array(N);
  const PY = new Float64Array(N);
  const VX = new Float64Array(N);
  const VY = new Float64Array(N);
  /** Inverse mass: the case's pinned bottom is 0, the cloth light, a roll heavy. */
  const W = new Float64Array(N);
  const bodies: Body[] = [];
  let off = 0;
  for (const r of rings) {
    const n = r.pts.length;
    const start = off;
    let cx = 0;
    r.pts.forEach(([x, y], k) => {
      X[off + k] = x;
      Y[off + k] = y;
      cx += x;
      W[off + k] = r.kind === "case" ? (y > baseline - 0.6 ? 0 : 1.5) : r.kind === "roll" ? 0.4 : 1;
    });
    cx /= n;
    const R = r.restPts ?? r.pts;
    let rx = 0;
    let ry = 0;
    for (const [x, y] of R) {
      rx += x;
      ry += y;
    }
    rx /= n;
    ry /= n;
    const rest = new Float64Array(n);
    const qx = new Float64Array(n);
    const qy = new Float64Array(n);
    const lx = new Float64Array(n);
    const ly = new Float64Array(n);
    for (let k = 0; k < n; k++) {
      const a = R[k];
      const b = R[(k + 1) % n];
      const p = R[(k - 1 + n) % n];
      rest[k] = Math.hypot(b[0] - a[0], b[1] - a[1]);
      qx[k] = a[0] - rx;
      qy[k] = a[1] - ry;
      lx[k] = a[0] - (p[0] + b[0]) / 2;
      ly[k] = a[1] - (p[1] + b[1]) / 2;
    }
    const a0 = Math.abs(signedArea(r.pts));
    const target = r.areaTarget ?? Math.abs(signedArea(R));
    bodies.push({
      kind: r.kind,
      id: r.id,
      start,
      n,
      rest,
      qx,
      qy,
      lx,
      ly,
      cx0: cx,
      seedArea: a0,
      target,
      areaMin: r.areaMin || (r.kind === "roll" ? target * rollFloor : 0),
      area0: a0,
      over: r.over,
      gx: new Float64Array(n),
      gy: new Float64Array(n),
      box: new Float64Array(4),
    });
    off += n;
  }
  const shell = bodies[0];
  const pcs = bodies.slice(1);
  const NB = bodies.length;
  const dt = 1 / 60 / substeps;
  const dt2 = dt * dt;
  const I = (b: Body, k: number) => b.start + (((k % b.n) + b.n) % b.n);
  const bodyOf = new Int32Array(N);
  const nextOf = new Int32Array(N);
  bodies.forEach((b, bi) => {
    for (let k = 0; k < b.n; k++) {
      bodyOf[b.start + k] = bi;
      nextOf[b.start + k] = b.start + ((k + 1) % b.n);
    }
  });

  /** A distance constraint; `unilateral` only ever shortens (cloth that may go slack). */
  function dist(i: number, j: number, L: number, alpha: number, unilateral: boolean) {
    const ws = W[i] + W[j];
    if (!ws) return;
    let dx = X[i] - X[j];
    let dy = Y[i] - Y[j];
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) return;
    const C = d - L;
    if (unilateral && C <= 0) return;
    const dl = -C / (ws + alpha / dt2);
    dx /= d;
    dy /= d;
    X[i] += W[i] * dx * dl;
    Y[i] += W[i] * dy * dl;
    X[j] -= W[j] * dx * dl;
    Y[j] -= W[j] * dy * dl;
  }
  function areaOf(b: Body) {
    let A = 0;
    for (let k = 0; k < b.n; k++) {
      const i = I(b, k);
      const j = I(b, k + 1);
      A += X[i] * Y[j] - X[j] * Y[i];
    }
    return A / 2;
  }
  /** Pressure: an area constraint toward `target`, each move capped so a full stack cannot explode. */
  function area(b: Body, target: number, alpha: number) {
    const A = areaOf(b);
    let den = 0;
    for (let k = 0; k < b.n; k++) {
      const p = I(b, k - 1);
      const q = I(b, k + 1);
      b.gx[k] = 0.5 * (Y[q] - Y[p]);
      b.gy[k] = 0.5 * (X[p] - X[q]);
      den += W[I(b, k)] * (b.gx[k] ** 2 + b.gy[k] ** 2);
    }
    const dl = -(A - target) / (den + alpha / dt2);
    for (let k = 0; k < b.n; k++) {
      const i = I(b, k);
      let mx = W[i] * b.gx[k] * dl;
      let my = W[i] * b.gy[k] * dl;
      const m = Math.hypot(mx, my);
      if (m > maxStep) {
        mx *= maxStep / m;
        my *= maxStep / m;
      }
      X[i] += mx;
      Y[i] += my;
    }
  }
  /** Shape memory toward the rest cushion (squash and stretch allowed, area-normalised, no turning); held front ↔ back loosely. */
  function shape(b: Body, stiff: number, beta: number) {
    let cx = 0;
    let cy = 0;
    for (let k = 0; k < b.n; k++) {
      cx += X[b.start + k];
      cy += Y[b.start + k];
    }
    cx /= b.n;
    cy /= b.n;
    let a00 = 0, a01 = 0, a10 = 0, a11 = 0, q00 = 0, q01 = 0, q11 = 0;
    for (let k = 0; k < b.n; k++) {
      const px = X[b.start + k] - cx;
      const py = Y[b.start + k] - cy;
      const qx = b.qx[k];
      const qy = b.qy[k];
      a00 += px * qx;
      a01 += px * qy;
      a10 += py * qx;
      a11 += py * qy;
      q00 += qx * qx;
      q01 += qx * qy;
      q11 += qy * qy;
    }
    const det = q00 * q11 - q01 * q01;
    const i00 = q11 / det;
    const i01 = -q01 / det;
    const i11 = q00 / det;
    let m00 = a00 * i00 + a01 * i01;
    let m01 = a00 * i01 + a01 * i11;
    let m10 = a10 * i00 + a11 * i01;
    let m11 = a10 * i01 + a11 * i11;
    const dm = Math.sqrt(Math.abs(m00 * m11 - m01 * m10)) || 1;
    m00 = (beta * m00) / dm + (1 - beta);
    m01 = (beta * m01) / dm;
    m10 = (beta * m10) / dm;
    m11 = (beta * m11) / dm + (1 - beta);
    for (let k = 0; k < b.n; k++) {
      const i = b.start + k;
      if (!W[i]) continue;
      X[i] += (cx + m00 * b.qx[k] + m01 * b.qy[k] - X[i]) * stiff;
      Y[i] += (cy + m10 * b.qx[k] + m11 * b.qy[k] - Y[i]) * stiff;
    }
    const dx = (b.cx0 - cx) * tether;
    for (let k = 0; k < b.n; k++) X[b.start + k] += dx;
  }
  /** Fabric under tension: each skin point eases toward its neighbours' midpoint; pressure holds the volume. */
  function smoothSkin(b: Body, w: number) {
    for (let k = 0; k < b.n; k++) {
      const i = I(b, k);
      const p = I(b, k - 1);
      const q = I(b, k + 1);
      X[i] += ((X[p] + X[q]) / 2 - X[i]) * w;
      Y[i] += ((Y[p] + Y[q]) / 2 - Y[i]) * w;
    }
  }

  // Contacts: every edge on a uniform grid, one sweep of the 3 × 3 cells round each point.
  const CELL = 12;
  const GW = Math.ceil(frame.width / CELL) + 2;
  const GH = Math.ceil(frame.height / CELL) + 6;
  const NC = GW * GH;
  const cellCount = new Int32Array(NC);
  const cellStart = new Int32Array(NC + 1);
  const edgeCells = new Int32Array(N * 6);
  const edgeCellN = new Int32Array(N);
  const cellEdges = new Int32Array(N * 6);
  const cellOf = (x: number, y: number) => {
    const cx = Math.min(Math.max(Math.floor(x / CELL) + 1, 0), GW - 1);
    const cy = Math.min(Math.max(Math.floor(y / CELL) + 4, 0), GH - 1);
    return cy * GW + cx;
  };
  function buildGrid() {
    cellCount.fill(0);
    for (let e = 0; e < N; e++) {
      const j = nextOf[e];
      const a = cellOf(Math.min(X[e], X[j]), Math.min(Y[e], Y[j]));
      const b = cellOf(Math.max(X[e], X[j]), Math.max(Y[e], Y[j]));
      let m = 0;
      for (let cy = (a - (a % GW)) / GW; cy <= (b - (b % GW)) / GW; cy++) {
        for (let cx = a % GW; cx <= b % GW; cx++) {
          if (m < 6) {
            edgeCells[e * 6 + m++] = cy * GW + cx;
            cellCount[cy * GW + cx]++;
          }
        }
      }
      edgeCellN[e] = m;
    }
    let s = 0;
    for (let c = 0; c < NC; c++) {
      cellStart[c] = s;
      s += cellCount[c];
    }
    cellStart[NC] = s;
    cellCount.fill(0);
    for (let e = 0; e < N; e++) {
      for (let m = 0; m < edgeCellN[e]; m++) {
        const c = edgeCells[e * 6 + m];
        cellEdges[cellStart[c] + cellCount[c]++] = e;
      }
    }
  }
  // Per body: the nearest edge to the point being swept, its foot and outward normal.
  const bD = new Float64Array(NB);
  const bI = new Int32Array(NB);
  const bJ = new Int32Array(NB);
  const bT = new Float64Array(NB);
  const bQX = new Float64Array(NB);
  const bQY = new Float64Array(NB);
  const bNX = new Float64Array(NB);
  const bNY = new Float64Array(NB);
  function consider(bi: number, i: number, x: number, y: number) {
    const j = nextOf[i];
    const ex = X[j] - X[i];
    const ey = Y[j] - Y[i];
    const l2 = ex * ex + ey * ey;
    let t = l2 ? ((x - X[i]) * ex + (y - Y[i]) * ey) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = X[i] + t * ex;
    const qy = Y[i] + t * ey;
    const d = (x - qx) * (x - qx) + (y - qy) * (y - qy);
    if (d < bD[bi]) {
      const l = Math.sqrt(l2) || 1;
      bD[bi] = d;
      bI[bi] = i;
      bJ[bi] = j;
      bT[bi] = t;
      bQX[bi] = qx;
      bQY[bi] = qy;
      bNX[bi] = ey / l;
      bNY[bi] = -ex / l;
    }
  }
  function sweep(self: number, x: number, y: number) {
    bD.fill(Infinity);
    const c0 = cellOf(x, y);
    const cx0 = c0 % GW;
    const cy0 = (c0 - cx0) / GW;
    for (let cy = cy0 - 1; cy <= cy0 + 1; cy++) {
      if (cy < 0 || cy >= GH) continue;
      for (let cx = cx0 - 1; cx <= cx0 + 1; cx++) {
        if (cx < 0 || cx >= GW) continue;
        const c = cy * GW + cx;
        for (let q = cellStart[c], qe = cellStart[c] + cellCount[c]; q < qe; q++) {
          const i = cellEdges[q];
          const bi = bodyOf[i];
          if (bi !== self) consider(bi, i, x, y);
        }
      }
    }
  }
  function nearestAll(bi: number, x: number, y: number) {
    bD[bi] = Infinity;
    const b = bodies[bi];
    for (let k = 0; k < b.n; k++) consider(bi, b.start + k, x, y);
  }
  function insideBody(b: Body, x: number, y: number) {
    let ins = false;
    for (let k = 0, m = b.n - 1; k < b.n; m = k++) {
      const i = b.start + k;
      const j = b.start + m;
      if (Y[i] > y !== Y[j] > y && x < ((X[j] - X[i]) * (y - Y[i])) / (Y[j] - Y[i]) + X[i]) ins = !ins;
    }
    return ins;
  }
  /** Separate point `k` from the edge found for body `bi` along (nx, ny) by `depth`, shared by inverse mass. */
  function push(k: number, bi: number, nx: number, ny: number, depth: number) {
    depth = Math.min(depth, 4 * maxStep);
    const ei = bI[bi];
    const ej = bJ[bi];
    const et = bT[bi];
    const wa = W[ei] * (1 - et);
    const wb = W[ej] * et;
    const ws = W[k] + wa * (1 - et) + wb * et;
    if (!ws) return;
    const s = depth / ws;
    X[k] += nx * s * W[k];
    Y[k] += ny * s * W[k];
    X[ei] -= nx * s * wa;
    Y[ei] -= ny * s * wa;
    X[ej] -= nx * s * wb;
    Y[ej] -= ny * s * wb;
  }
  function aabb(b: Body) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let k = 0; k < b.n; k++) {
      const i = b.start + k;
      if (X[i] < x0) x0 = X[i];
      if (X[i] > x1) x1 = X[i];
      if (Y[i] < y0) y0 = Y[i];
      if (Y[i] > y1) y1 = Y[i];
    }
    b.box[0] = x0;
    b.box[1] = y0;
    b.box[2] = x1;
    b.box[3] = y1;
  }
  function collide() {
    buildGrid();
    for (const b of bodies) aabb(b);
    for (let bi = 1; bi < NB; bi++) {
      const A = bodies[bi];
      for (let k = A.start; k < A.start + A.n; k++) {
        sweep(bi, X[k], Y[k]);
        for (let bj = 1; bj < NB; bj++) {
          if (bj === bi) continue;
          const bx = bodies[bj].box;
          if (X[k] < bx[0] - gap || X[k] > bx[2] + gap || Y[k] < bx[1] - gap || Y[k] > bx[3] + gap) continue;
          let s: number;
          if (bD[bj] !== Infinity) s = (X[k] - bQX[bj]) * bNX[bj] + (Y[k] - bQY[bj]) * bNY[bj];
          else if (insideBody(bodies[bj], X[k], Y[k])) {
            // Deep inside a neighbour, beyond the grid's reach: find its nearest edge the slow way.
            nearestAll(bj, X[k], Y[k]);
            s = -Math.sqrt(bD[bj]);
          } else continue;
          if (s < gap) push(k, bj, bNX[bj], bNY[bj], gap - s);
        }
        if (A.over) continue;
        let s: number;
        if (bD[0] !== Infinity) s = (X[k] - bQX[0]) * bNX[0] + (Y[k] - bQY[0]) * bNY[0];
        else if (!insideBody(shell, X[k], Y[k])) {
          nearestAll(0, X[k], Y[k]);
          s = Math.sqrt(bD[0]);
        } else continue;
        if (s > -margin) push(k, 0, -bNX[0], -bNY[0], s + margin);
      }
    }
  }
  /** The cloth never billows more than `billow` past its sewn outline. */
  function holdToSeam(i: number) {
    const d = sdf(X[i], Y[i]);
    if (d <= billow) return;
    const e = 0.75;
    const gx = sdf(X[i] + e, Y[i]) - sdf(X[i] - e, Y[i]);
    const gy = sdf(X[i], Y[i] + e) - sdf(X[i], Y[i] - e);
    const gl = Math.hypot(gx, gy) || 1;
    X[i] -= (gx / gl) * (d - billow);
    Y[i] -= (gy / gl) * (d - billow);
  }
  function substep() {
    for (let i = 0; i < N; i++) {
      if (!W[i]) continue;
      PX[i] = X[i];
      PY[i] = Y[i];
      VY[i] += gravity * dt;
      X[i] += VX[i] * dt;
      Y[i] += VY[i] * dt;
    }
    // The cloth: never longer than sewn, drawn lightly toward its slumped rest, keeping the outline's own curves, never past the sewn shape.
    for (let k = 0; k < shell.n; k++) dist(I(shell, k), I(shell, k + 1), shell.rest[k], 0, true);
    for (let k = 0; k < shell.n; k++) {
      const i = I(shell, k);
      if (!W[i]) continue;
      X[i] += (slumped[k][0] - X[i]) * casePull;
      Y[i] += (slumped[k][1] - Y[i]) * casePull;
      const p = I(shell, k - 1);
      const q = I(shell, k + 1);
      X[i] -= (X[i] - (X[p] + X[q]) / 2 - shell.lx[k]) * caseDetail;
      Y[i] -= (Y[i] - (Y[p] + Y[q]) / 2 - shell.ly[k]) * caseDetail;
      // Cloth bends smoothly: no kink between points two apart that the sewn outline does not have.
      if (caseBend > 0) {
        const p2 = I(shell, k - 2);
        const q2 = I(shell, k + 2);
        X[i] -= (X[i] - (X[p2] + X[q2]) / 2 - shell.lx[k] * 4) * caseBend;
        Y[i] -= (Y[i] - (Y[p2] + Y[q2]) / 2 - shell.ly[k] * 4) * caseBend;
      }
      holdToSeam(i);
    }
    for (const b of pcs) {
      const roll = b.kind === "roll";
      // Cloth around fill: the fabric (a roll's cover too) neither stretches nor shrinks, so puffing up shortens it and squashing lengthens it.
      for (let k = 0; k < b.n; k++) dist(I(b, k), I(b, k + 1), b.rest[k], fabricCompliance, false);
      smoothSkin(b, skin);
      area(b, b.area0, (roll ? rollGive : areaCompliance) * (b.target / 10000));
      if (b.areaMin && areaOf(b) < b.areaMin) area(b, b.areaMin, 0);
      shape(b, roll ? rollMemory : shapeMemory, roll ? rollBeta : 0.85);
    }
    collide();
    // A full stack presses the cloth out; the seam holds it, and the pieces meet it next substep.
    for (let k = 0; k < shell.n; k++) if (W[I(shell, k)]) holdToSeam(I(shell, k));
    for (let i = 0; i < N; i++) {
      if (!W[i]) continue;
      if (Y[i] > baseline) Y[i] = baseline;
      VX[i] = ((X[i] - PX[i]) / dt) * 0.96;
      VY[i] = ((Y[i] - PY[i]) / dt) * 0.96;
    }
  }

  let done = 0;
  return {
    steps,
    get stepsDone() {
      return done;
    },
    step(n = 1) {
      for (let s = 0; s < n && done < steps; s++, done++) {
        const ramp = Math.min(1, (done + 1) / Math.max(1, steps * inflate));
        for (const b of pcs) b.area0 = b.seedArea + (b.target - b.seedArea) * ramp;
        for (let ss = 0; ss < substeps; ss++) substep();
      }
      return done >= steps;
    },
    snapshot() {
      return {
        case: Array.from({ length: shell.n }, (_, k): Pt => [X[shell.start + k], Y[shell.start + k]]),
        bodies: pcs.map((b) => ({ id: b.id, ring: Array.from({ length: b.n }, (_, k): Pt => [X[b.start + k], Y[b.start + k]]) })),
      };
    },
  };
}

/**
 * A shrink-free low-pass (Taubin λ|μ): ripples shorter than a few point
 * spacings go; contact flats, bends and volume stay. `fixed` points stay put.
 */
export function taubin(P: readonly Pt[], passes = 6, fixed: readonly boolean[] | null = null, lambda = 0.5, mu = -0.53): Pt[] {
  const n = P.length;
  let A: Pt[] = P.map((p) => [p[0], p[1]]);
  for (let s = 0; s < passes; s++) {
    for (const f of [lambda, mu]) {
      const B: Pt[] = new Array(n);
      for (let i = 0; i < n; i++) {
        const p = A[i];
        if (fixed && fixed[i]) {
          B[i] = p;
          continue;
        }
        const a = A[(i - 1 + n) % n];
        const b = A[(i + 1) % n];
        B[i] = [p[0] + f * ((a[0] + b[0]) / 2 - p[0]), p[1] + f * ((a[1] + b[1]) / 2 - p[1])];
      }
      A = B;
    }
  }
  return A;
}

/**
 * What is drawn: each outline evenly respaced (about every `spacing` view
 * units) and low-passed `passes` times; the case keeps its flat bottom and
 * its two corners, and the cloth above them is smoothed.
 */
export function smoothSnapshot(snap: SoftSnapshot, { baseline, spacing = 5, passes = 8, casePasses = passes }: { baseline: number; spacing?: number; passes?: number; casePasses?: number }): SoftSnapshot {
  const bodies = snap.bodies.map((b) => {
    const n = Math.max(32, Math.round(ringLength(b.ring) / spacing));
    return { ...b, ring: taubin(resample(b.ring, n), passes) };
  });
  const caseN = Math.max(64, Math.round(ringLength(snap.case) / spacing));
  const C = resample(snap.case, caseN);
  const fixed = C.map(([, y]) => y > baseline - 0.6);
  for (let i = 0; i < caseN; i++) if (fixed[i]) C[i] = [C[i][0], baseline];
  return { ...snap, bodies, case: taubin(C, casePasses, fixed) };
}

/** Where a label fits best: the inside point farthest from the outline (a coarse pole of inaccessibility). */
export function labelSpot(P: readonly Pt[]): { at: Pt; r: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of P) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  let best: Pt = [(x0 + x1) / 2, (y0 + y1) / 2];
  let bd = -1;
  for (let gx = 0; gx <= 24; gx++) {
    for (let gy = 0; gy <= 12; gy++) {
      const x = x0 + ((x1 - x0) * gx) / 24;
      const y = y0 + ((y1 - y0) * gy) / 12;
      if (!pointInPolygon(P, x, y)) continue;
      const d = distanceToPolygon(P, x, y);
      if (d > bd) {
        bd = d;
        best = [x, y];
      }
    }
  }
  return { at: best, r: Math.max(bd, 0) };
}
