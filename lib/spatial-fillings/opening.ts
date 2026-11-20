import type { Pt } from "./conform";

const INF = 1e20;

function dt1d(f: Float64Array, n: number, out: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -INF;
  z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    out[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
}

function edt2(mask: Uint8Array, w: number, h: number): Float64Array {
  const d = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = mask[i] ? INF : 0;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const o = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = d[y * w + x];
    dt1d(f, h, o, v, z);
    for (let y = 0; y < h; y++) d[y * w + x] = o[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = d[y * w + x];
    dt1d(f, w, o, v, z);
    for (let x = 0; x < w; x++) d[y * w + x] = o[x];
  }
  return d;
}

function rasterize(ring: Pt[], x0: number, y0: number, w: number, h: number, s: number): Uint8Array {
  const mask = new Uint8Array(w * h);
  const xs: number[] = [];
  for (let j = 0; j < h; j++) {
    const y = y0 + (j + 0.5) / s;
    xs.length = 0;
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[(i + 1) % ring.length];
      if (ay === by || y < Math.min(ay, by) || y >= Math.max(ay, by)) continue;
      xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - x0) * s - 0.5));
      const i1 = Math.min(w - 1, Math.floor((xs[k + 1] - x0) * s - 0.5));
      for (let i = i0; i <= i1; i++) mask[j * w + i] = 1;
    }
  }
  return mask;
}

const NB: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

function traceBoundary(mask: Uint8Array, w: number, h: number, sx: number, sy: number): Array<[number, number]> {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  let x = sx;
  while (at(x - 1, sy)) x--;
  const start: [number, number] = [x, sy];
  const out: Array<[number, number]> = [start];
  let cur = start;
  let dir = 6;
  const limit = 4 * (w + h) * 4;
  for (let step = 0; step < limit; step++) {
    let found = -1;
    for (let k = 0; k < 8; k++) {
      const d = (dir + k) % 8;
      const nx = cur[0] + NB[d][0];
      const ny = cur[1] + NB[d][1];
      if (at(nx, ny)) {
        found = d;
        cur = [nx, ny];
        break;
      }
    }
    if (found < 0) break;
    if (cur[0] === start[0] && cur[1] === start[1] && out.length > 1) break;
    out.push(cur);
    dir = (found + 6) % 8;
  }
  return out;
}

export function openRing(ring: Pt[], r: number): Pt[] {
  if (ring.length < 3 || r <= 0) return ring;
  const s = Math.min(4, Math.max(1, Math.ceil(24 / r)));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const pad = 2;
  const x0 = minX - pad;
  const y0 = minY - pad;
  const w = Math.ceil((maxX - minX + 2 * pad) * s) + 1;
  const h = Math.ceil((maxY - minY + 2 * pad) * s) + 1;
  const mask = rasterize(ring, x0, y0, w, h, s);
  const inside = edt2(mask, w, h);
  let maxD2 = 0;
  let thickest = -1;
  for (let i = 0; i < w * h; i++) {
    if (inside[i] > maxD2) {
      maxD2 = inside[i];
      thickest = i;
    }
  }
  if (thickest < 0) return [];
  const rc = Math.min(r * s, Math.sqrt(maxD2) - 0.5);
  const rc2 = rc * rc;
  const eroded = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) eroded[i] = inside[i] > rc2 ? 1 : 0;
  const inv = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) inv[i] = eroded[i] ? 0 : 1;
  const toEroded = edt2(inv, w, h);
  const opened = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) opened[i] = toEroded[i] <= rc2 ? 1 : 0;
  const cells = traceBoundary(opened, w, h, thickest % w, Math.floor(thickest / w));
  return cells.map(([i, j]): Pt => [x0 + (i + 0.5) / s, y0 + (j + 0.5) / s]);
}
