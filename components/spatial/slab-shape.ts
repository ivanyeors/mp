import { resample } from "@/lib/spatial-fillings/soft-body";
import type { PadWell } from "@/lib/spatial-fillings/soft-body-settings";

export type SlabBox = { x: number; y: number; w: number; h: number };

export type SlabContacts = { top: boolean; front: boolean; back: boolean };

export const FREE: SlabContacts = { top: false, front: false, back: false };

type Pt = [number, number];
type Cubic = [Pt, Pt, Pt, Pt];

const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

const CAP = 0.62;

function unit(dx: number, dy: number): Pt {
  const len = Math.hypot(dx, dy);
  return len > 1e-9 ? [dx / len, dy / len] : [1, 0];
}

function cushion({ x, y, w, h }: SlabBox, puff: number, contacts: SlabContacts): Cubic[] {
  const p = clamp01(puff);
  const endOf = (pressed: boolean) => h * (pressed ? 0.3 : 0.5 + 0.22 * p);
  let rxL = endOf(contacts.front);
  let rxR = endOf(contacts.back);
  if (rxL + rxR > w) {
    const k = w / (rxL + rxR);
    rxL *= k;
    rxR *= k;
  }
  const xL = x + rxL;
  const xR = x + w - rxR;
  const half = Math.max((xR - xL) / 2, 0);
  const xA = (xL + xR) / 2;
  const crown = Math.min(h * (contacts.top ? 0.03 * p : 0.05 + 0.17 * p), half * 0.35);
  const belly = Math.min(h * 0.015, half * 0.2);
  const yT = y + crown;
  const yB = y + h - belly;
  const yM = yT + (yB - yT) * 0.55;
  const yb = y + h;
  const xr = x + w;
  const [ux, uy] = unit(half / 2, crown);
  const [vx, vy] = unit(half / 2, belly);
  const aL = CAP * rxL;
  const aR = CAP * rxR;
  const bT = CAP * (yM - yT);
  const bB = CAP * (yB - yM);
  return [
    [[xA, y], [xA + half / 3, y], [xR - half / 3, yT - (2 * crown) / 3], [xR, yT]],
    [[xR, yT], [xR + ux * aR, yT + uy * aR], [xr, yM - bT], [xr, yM]],
    [[xr, yM], [xr, yM + bB], [xR + vx * aR, yB - vy * aR], [xR, yB]],
    [[xR, yB], [xR - half / 3, yB + (2 * belly) / 3], [xA + half / 3, yb], [xA, yb]],
    [[xA, yb], [xA - half / 3, yb], [xL + half / 3, yB + (2 * belly) / 3], [xL, yB]],
    [[xL, yB], [xL - vx * aL, yB - vy * aL], [x, yM + bB], [x, yM]],
    [[x, yM], [x, yM - bT], [xL - ux * aL, yT + uy * aL], [xL, yT]],
    [[xL, yT], [xL + half / 3, yT - (2 * crown) / 3], [xA - half / 3, y], [xA, y]],
  ];
}

const pathOf = (cubics: Cubic[]) =>
  [`M${r1(cubics[0][0][0])} ${r1(cubics[0][0][1])}`, ...cubics.map(([, a, b, c]) => `C${[a, b, c].flat().map(r1).join(" ")}`), "Z"].join(" ");

export function puffyPath(box: SlabBox, puff = 1, contacts: SlabContacts = FREE): string {
  return pathOf(cushion(box, puff, contacts));
}

function sampleCubics(cubics: Cubic[], spacing: number): Pt[] {
  const out: Pt[] = [];
  for (const [p0, p1, p2, p3] of cubics) {
    const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) + Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) + Math.hypot(p3[0] - p2[0], p3[1] - p2[1]);
    const steps = Math.max(4, Math.ceil(len / spacing));
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const s = 1 - t;
      const a = s * s * s;
      const b = 3 * s * s * t;
      const c = 3 * s * t * t;
      const d = t * t * t;
      out.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
    }
  }
  return out;
}

export function smoothClosedPath(points: readonly Pt[]): string {
  const n = points.length;
  if (n < 3) return "";
  const p = (i: number) => points[(i + n) % n];
  const parts = [`M${r1(p(0)[0])} ${r1(p(0)[1])}`];
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    parts.push(`C${[c1[0], c1[1], c2[0], c2[1], p2[0], p2[1]].map(r1).join(" ")}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

export type ShellPolygon = readonly Pt[];

export type ShellTransform = { tx: number; ty: number; sx: number; sy: number };

export function shellPolygon(d: string, t: ShellTransform, perCubic = 24): ShellPolygon {
  const tokens = d.match(/[MLHVCZmlhvcz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  const pts: Pt[] = [];
  let i = 0;
  let cmd = "";
  let cur: Pt = [0, 0];
  const num = () => Number(tokens[i++]);
  const push = (pt: Pt) => {
    cur = pt;
    pts.push(pt);
  };
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i])) cmd = tokens[i++];
    if (cmd === "Z" || cmd === "z") continue;
    if (cmd === "M" || cmd === "L") push([num(), num()]);
    else if (cmd === "H") push([num(), cur[1]]);
    else if (cmd === "V") push([cur[0], num()]);
    else if (cmd === "C") {
      const p0 = cur;
      const p1: Pt = [num(), num()];
      const p2: Pt = [num(), num()];
      const p3: Pt = [num(), num()];
      for (let k = 1; k <= perCubic; k++) {
        const u = k / perCubic;
        const s = 1 - u;
        push([
          s * s * s * p0[0] + 3 * s * s * u * p1[0] + 3 * s * u * u * p2[0] + u * u * u * p3[0],
          s * s * s * p0[1] + 3 * s * s * u * p1[1] + 3 * s * u * u * p2[1] + u * u * u * p3[1],
        ]);
      }
    } else i++;
  }
  return pts.map(([x, y]) => [t.tx + t.sx * x, t.ty + t.sy * y]);
}

function insidePolygon(poly: ShellPolygon, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function nearestOnPolygon(poly: ShellPolygon, x: number, y: number): Pt {
  let best: Pt = poly[0];
  let bestD = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j];
    const [bx, by] = poly[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? clamp01(((x - ax) * dx + (y - ay) * dy) / len2) : 0;
    const qx = ax + t * dx;
    const qy = ay + t * dy;
    const d = (x - qx) ** 2 + (y - qy) ** 2;
    if (d < bestD) {
      bestD = d;
      best = [qx, qy];
    }
  }
  return best;
}

function pressIn(poly: ShellPolygon, margin: number, x: number, y: number): Pt {
  const [qx, qy] = nearestOnPolygon(poly, x, y);
  const d = Math.hypot(x - qx, y - qy);
  const inside = insidePolygon(poly, x, y);
  if (inside && d >= margin) return [x, y];
  let [nx, ny] = inside ? [x - qx, y - qy] : [qx - x, qy - y];
  if (d < 1e-6) {
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length;
    const cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    [nx, ny] = [cx - qx, cy - qy];
  }
  const [ux, uy] = unit(nx, ny);
  return [qx + ux * margin, qy + uy * margin];
}

export type PouchShaping = {
  contacts?: SlabContacts;
  well?: PadWell;
  sag?: readonly number[];
  sagTop?: readonly number[];
  shell?: { polygon: ShellPolygon; margin: number };
};

export function wellDip(t: number, well: PadWell): number {
  if (well.depth <= 0 || well.width <= 0) return 0;
  const u = Math.abs(t - 0.5) / (well.width / 2);
  if (u >= 1) return 0;
  const FLOOR = 0.35;
  return u <= FLOOR ? well.depth : (well.depth * (1 + Math.cos((Math.PI * (u - FLOOR)) / (1 - FLOOR)))) / 2;
}

function dipped(pts: readonly Pt[], box: SlabBox, well: PadWell): Pt[] {
  return pts.map(([x, y]): Pt => {
    const t = box.w > 0 ? (x - box.x) / box.w : 0.5;
    const v = box.h > 0 ? clamp01((y - box.y) / box.h) : 1;
    const k = clamp01(1 - v / 0.6);
    return [x, y + wellDip(t, well) * box.h * k];
  });
}

export function padRing(box: SlabBox, well: PadWell, n: number): Pt[] {
  return resample(dipped(sampleCubics(cushion(box, 1, FREE), Math.max(Math.min(box.h / 6, 4), 1)), box, well), n);
}

function sagAt(sag: readonly number[], t: number): number {
  const x = clamp01(t) * (sag.length - 1);
  const k = Math.min(Math.floor(x), sag.length - 2);
  return sag[k] + (sag[k + 1] - sag[k]) * (x - k);
}

export function pouchPath(box: SlabBox, puff = 1, shaping: PouchShaping = {}): string {
  const cubics = cushion(box, puff, shaping.contacts ?? FREE);
  const sag = shaping.sag && shaping.sag.length > 1 && shaping.sag.some((v) => v > 0.05) ? shaping.sag : null;
  const shell = shaping.shell && shaping.shell.polygon.length > 2 ? shaping.shell : null;
  const well = shaping.well && wellDip(0.5, shaping.well) > 0 ? shaping.well : null;
  if (!sag && !shell && !well) return pathOf(cubics);
  const raw = sampleCubics(cubics, well ? Math.max(Math.min(box.h / 6, 4), 1) : Math.max(Math.min(box.h / 3, 10), 3));
  const pts = well ? dipped(raw, box, well) : raw;
  const sagTop = sag && shaping.sagTop && shaping.sagTop.length === sag.length ? shaping.sagTop : sag;
  let moved = well !== null;
  const out = pts.map(([x, y]): Pt => {
    let py = y;
    if (sag && sagTop) {
      const t = box.w > 0 ? (x - box.x) / box.w : 0.5;
      const v = box.h > 0 ? clamp01((y - box.y) / box.h) : 1;
      const dy = sagAt(sagTop, t) + (sagAt(sag, t) - sagAt(sagTop, t)) * v;
      if (dy > 0.05) {
        py += dy;
        moved = true;
      }
    }
    if (!shell) return [x, py];
    const [qx, qy] = pressIn(shell.polygon, shell.margin, x, py);
    if (Math.abs(qx - x) > 0.05 || Math.abs(qy - py) > 0.05) moved = true;
    return [qx, qy];
  });
  return moved ? smoothClosedPath(out) : pathOf(cubics);
}

export function rollPath({ x, y, w, h }: SlabBox): string {
  const r = Math.min(w, h) / 2;
  const cx = x + w / 2;
  const cy = y + h - r;
  return `M${r1(cx - r)} ${r1(cy)} A${r1(r)} ${r1(r)} 0 1 0 ${r1(cx + r)} ${r1(cy)} A${r1(r)} ${r1(r)} 0 1 0 ${r1(cx - r)} ${r1(cy)} Z`;
}

export function puffOf(drawnMm: number, relaxedMm: number): number {
  return relaxedMm > 0 ? clamp01(drawnMm / relaxedMm) : 1;
}
