/**
 * The cross-section's filling shapes, seen side-on: a stuffed pouch is not a
 * box. Its ends are rounded about half its height, its top crowns and its
 * underside bellies a little, and both flatten as the fill is spread or
 * squeezed (`puff`, 1 = relaxed, 0 = pressed flat). Pure path strings in view
 * units, inside the box they are given, so stacked pouches still sum to the
 * column's loft — a crown meets the belly above it, the shoulders leave a
 * gap, which is what reads as two cushions. No rects on the x-ray family of
 * drawings.
 */

export type SlabBox = { x: number; y: number; w: number; h: number };

const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);

/** Cap handle length, a touch fuller than a circle's 0.552 so the ends read soft, not pointed. */
const CAP = 0.62;

type Puffy = {
  xL: number;
  xR: number;
  cx: number;
  yT: number;
  yB: number;
  yM: number;
  half: number;
  crown: number;
  belly: number;
  rx: number;
};

function puffyFrame({ x, y, w, h }: SlabBox, puff: number): Puffy {
  const p = clamp01(puff);
  const rx = Math.min(w / 2, h * 0.62);
  const half = Math.max(w / 2 - rx, 0);
  // Never steeper than the run allows: a short pouch is all ends and no crown.
  const crown = Math.min(h * (0.04 + 0.1 * p), half * 0.35);
  const belly = Math.min(h * (0.015 + 0.035 * p), half * 0.2);
  const yT = y + crown;
  const yB = y + h - belly;
  return { xL: x + rx, xR: x + w - rx, cx: x + w / 2, yT, yB, yM: (yT + yB) / 2, half, crown, belly, rx };
}

/** A unit vector, or the fallback when the vector is zero. */
function unit(dx: number, dy: number): [number, number] {
  const len = Math.hypot(dx, dy);
  return len > 1e-9 ? [dx / len, dy / len] : [1, 0];
}

/**
 * The pouch outline: crown and belly are parabolas (each a cubic) meeting
 * the rounded ends with matching tangents, so there is no kink anywhere.
 */
export function puffyPath(box: SlabBox, puff = 1): string {
  const { x, y, w, h } = box;
  const { xL, xR, cx, yT, yB, yM, half, crown, belly, rx } = puffyFrame(box, puff);
  // Tangents where the crown and the belly reach the ends, pointing outward (right side).
  const [ux, uy] = unit(half / 2, crown);
  const [vx, vy] = unit(half / 2, belly);
  const a = CAP * rx;
  const bT = CAP * (yM - yT);
  const bB = CAP * (yB - yM);
  const xr = x + w;
  const yb = y + h;
  const c = (...n: number[]) => `C${n.map(r1).join(" ")}`;
  return [
    `M${r1(cx)} ${r1(y)}`,
    c(cx + half / 3, y, xR - half / 3, yT - (2 * crown) / 3, xR, yT),
    c(xR + ux * a, yT + uy * a, xr, yM - bT, xr, yM),
    c(xr, yM + bB, xR + vx * a, yB - vy * a, xR, yB),
    c(xR - half / 3, yB + (2 * belly) / 3, cx + half / 3, yb, cx, yb),
    c(cx - half / 3, yb, xL + half / 3, yB + (2 * belly) / 3, xL, yB),
    c(xL - vx * a, yB - vy * a, x, yM + bB, x, yM),
    c(x, yM - bT, xL - ux * a, yT + uy * a, xL, yT),
    c(xL + half / 3, yT - (2 * crown) / 3, cx - half / 3, y, cx, y),
    "Z",
  ].join(" ");
}

/**
 * The sheen along the top-left of the crown — one soft stroke that makes the
 * fill read as a full, rounded pouch. Empty when the slab is too small to
 * carry it.
 */
export function puffyGloss(box: SlabBox, puff = 1): string {
  const { x, y, w, h } = box;
  if (h < 9 || w < 24) return "";
  const { xL, yT, crown, rx, half } = puffyFrame(box, puff);
  const inset = Math.min(h * 0.2, 6);
  const x0 = x + rx * 0.45;
  const y0 = y + h * 0.42;
  const x1 = xL + Math.min(half * 0.55, w * 0.22);
  const y1 = Math.max(y + inset, yT - crown * 0.4 + inset * 0.6);
  return `M${r1(x0)} ${r1(y0)} Q${r1(x0 + rx * 0.08)} ${r1(y + inset)} ${r1((x0 + x1) / 2 + rx * 0.3)} ${r1(y1)} T${r1(x1)} ${r1(y1)}`;
}

/** A Neck support seen side-on: a round roll, sitting on the bottom of its box. */
export function rollPath({ x, y, w, h }: SlabBox): string {
  const r = Math.min(w, h) / 2;
  const cx = x + w / 2;
  const cy = y + h - r;
  return `M${r1(cx - r)} ${r1(cy)} A${r1(r)} ${r1(r)} 0 1 0 ${r1(cx + r)} ${r1(cy)} A${r1(r)} ${r1(r)} 0 1 0 ${r1(cx - r)} ${r1(cy)} Z`;
}

/** The roll's sheen: a short arc on its upper left. */
export function rollGloss({ x, y, w, h }: SlabBox): string {
  const r = Math.min(w, h) / 2;
  if (r < 6) return "";
  const cx = x + w / 2;
  const cy = y + h - r;
  const k = r * 0.62;
  const from = [cx - k * Math.cos(0.35), cy - k * Math.sin(0.35)];
  const to = [cx - k * Math.cos(1.25), cy - k * Math.sin(1.25)];
  return `M${r1(from[0])} ${r1(from[1])} A${r1(k)} ${r1(k)} 0 0 1 ${r1(to[0])} ${r1(to[1])}`;
}

/** How full a pouch still looks: drawn ÷ relaxed thickness, so a spread or squeezed pouch draws flatter. */
export function puffOf(drawnMm: number, relaxedMm: number): number {
  return relaxedMm > 0 ? clamp01(drawnMm / relaxedMm) : 1;
}
