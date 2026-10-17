/**
 * Cross-section model (X-ray pillow UX slice 05, ADR 0019): the fit result cut
 * along one Section (front, middle, back), as columns against the loft line.
 * Pure: reads the fit the host already computed; the renderer never recomputes
 * it, so the x-ray and the cross-section cannot disagree.
 */

import { SUB_SECTIONS, type Section, type SubSection } from "./core";
import type { ColumnFit, FitStatus, PillowFit } from "./fit";
import { REFERENCE_SIZE, SEAM_MM, type PillowSize, type ResolvedDims } from "./dimensions";

export type Cut = { section: Section };

export const DEFAULT_CUT: Cut = { section: "center" };

export type CrossSectionSlab = {
  depth: number;
  heightMm: number;
  /** The piece that sets the plane's thickness; colours the slab by family. */
  itemId: number;
  status: FitStatus;
  /** A compressed slab is hatched. */
  hatched: boolean;
};

export type CrossSectionColumn = {
  key: SubSection;
  label: string;
  /** The sub-section's length, mm. */
  widthMm: number;
  maxLoftMm: number;
  loftMm: number;
  status: FitStatus;
  /** Bottom → top. Empty for an empty column. */
  slabs: CrossSectionSlab[];
};

function columnOf(key: SubSection, widthMm: number, maxLoftMm: number, column: ColumnFit | null): CrossSectionColumn {
  return {
    key,
    label: key,
    widthMm,
    maxLoftMm,
    loftMm: column?.loftMm ?? 0,
    status: column?.status ?? "ok",
    // Deepest plane at the bottom: the pillow lies on its back panel.
    slabs: (column?.planes ?? [])
      .slice()
      .sort((a, b) => b.depth - a.depth)
      .map((pl) => ({
        depth: pl.depth,
        heightMm: pl.thicknessMm,
        itemId: pl.itemId,
        status: pl.status,
        hatched: pl.status !== "ok",
      })),
  };
}

/**
 * The three sub-sections of the cut's Section, each one cell long. Slab
 * heights sum to the column's `loftMm` and never exceed `maxLoftMm` unless the
 * column is `over`.
 */
export function crossSectionSlabs(fit: PillowFit, cut: Cut): CrossSectionColumn[] {
  const sf = fit.sections[cut.section];
  return SUB_SECTIONS.map((subSection) => columnOf(subSection, fit.settle.cellLengthMm, sf.maxLoftMm, sf.columns[subSection]));
}

/** One piece in the along cut: drawn once over its settled span, stacked on what lies under it. */
export type AlongSlab = {
  key: string;
  itemId: number;
  depth: number;
  /** mm from the Section's front. */
  startMm: number;
  endMm: number;
  /** mm above the back panel. */
  bottomMm: number;
  heightMm: number;
  /** Its thickness at this Size before it settled or was squeezed, mm (the Settings value × the Size's factor). */
  relaxedMm: number;
  /** Its thickness once settled (spread into an empty neighbour thins it), before any squeeze, mm. */
  settledMm: number;
  status: FitStatus;
  hatched: boolean;
  /**
   * What presses on it: something lying on its top; a neighbour, or the
   * Section's end, against its front / back end. A pressed face draws flat,
   * a free one domes — the squish of pouches packed into a case.
   */
  pressed: { top: boolean; front: boolean; back: boolean };
  /**
   * How far its underside sags below `bottomMm` where nothing holds it up,
   * mm, at `SAG_SAMPLES + 1` points evenly front → back; empty when it lies
   * flat. A pouch is soft: over a gap or off a ledge it drapes, and whatever
   * lies on it follows.
   */
  sagMm: number[];
  /** How far its top dips, at the same points: the underside's sag smoothed over its thickness. */
  sagTopMm: number[];
};

/** Intervals in a slab's sag profile. */
export const SAG_SAMPLES = 24;
/** The support profile's resolution along the Section, mm. */
const SUPPORT_STEP_MM = 2;
/** A pouch bends about as tightly as it is thick, a little stiffer: the radius it drapes with, × its thickness. */
const DRAPE_RADIUS = 1.2;

/**
 * The along cut piece by piece: a pouch that settles front-to-back is one
 * slab, not one per column. Deepest first, each rests on the highest thing
 * under it (a seam in from each end), else on the back panel, and drapes
 * where what is under it falls away: its underside follows the support as a
 * cloth of bending radius ~ its thickness would (a ball rolled along under
 * it), never below the back panel. Pieces in one plane share a support; the
 * plane above rests on their draped tops.
 */
export function alongSlabs(fit: PillowFit, section: Section): AlongSlab[] {
  const settled = new Map(fit.settle.pieces.map((s) => [s.key, s] as const));
  const lengthMm = fit.settle.cellLengthMm * SUB_SECTIONS.length;
  const n = Math.max(Math.floor(lengthMm / SUPPORT_STEP_MM), 1) + 1;
  const at = (mm: number) => Math.min(Math.max(Math.round(mm / SUPPORT_STEP_MM), 0), n - 1);
  // The top of what lies under the next plane, mm above the back panel.
  const support = new Float64Array(n);
  const placed: AlongSlab[] = [];
  const pieces = [...fit.sections[section].pieces].sort((a, b) => b.depth - a.depth);
  for (let i = 0; i < pieces.length; ) {
    let j = i;
    while (j < pieces.length && pieces[j].depth === pieces[i].depth) j++;
    const tops: { i0: number; top: Float64Array }[] = [];
    for (const p of pieces.slice(i, j)) {
      const i0 = at(p.startMm);
      const i1 = Math.max(at(p.endMm), i0);
      let a = at(p.startMm + SEAM_MM);
      let b = at(p.endMm - SEAM_MM);
      if (a > b) a = b = at((p.startMm + p.endMm) / 2);
      let bottomMm = 0;
      for (let k = a; k <= b; k++) bottomMm = Math.max(bottomMm, support[k]);
      // Drape: the underside a ball of the bending radius would trace, rolled along under the pouch's own span.
      const r = Math.max(p.thicknessMm * DRAPE_RADIUS, SUPPORT_STEP_MM);
      const reach = Math.floor(r / SUPPORT_STEP_MM);
      const rolled = new Float64Array(i1 - i0 + 1);
      for (let k = i0; k <= i1; k++) {
        let c = -Infinity;
        for (let q = Math.max(i0, k - reach); q <= Math.min(i1, k + reach); q++) {
          const u = (q - k) * SUPPORT_STEP_MM;
          c = Math.max(c, support[q] + Math.sqrt(Math.max(r * r - u * u, 0)));
        }
        rolled[k - i0] = c - r;
      }
      // Two arcs meet in a cusp over a narrow gap; cloth hangs in one curve. Smooth it, never through what is under it.
      const under = smoothed(rolled, Math.max(Math.round(r / 4 / SUPPORT_STEP_MM), 1)).map((u, k) =>
        Math.min(Math.max(u, support[i0 + k], 0), bottomMm),
      );
      const sagUnder = under.map((u) => bottomMm - u);
      // The top follows the underside smoothed over the pouch's own thickness: over a narrow gap the fill
      // pools and the top barely dips; off a ledge the whole pouch bends.
      const sagTop = smoothed(sagUnder, Math.max(Math.round(p.thicknessMm / 2 / SUPPORT_STEP_MM), 1));
      tops.push({ i0, top: sagTop.map((s) => bottomMm + p.thicknessMm - s) });
      const sample = (values: Float64Array) =>
        Array.from({ length: SAG_SAMPLES + 1 }, (_, s) => {
          const x = (s / SAG_SAMPLES) * (values.length - 1);
          const k = Math.min(Math.floor(x), Math.max(values.length - 2, 0));
          const v = values.length > 1 ? values[k] + (values[k + 1] - values[k]) * (x - k) : values[0];
          return Math.round(v * 10) / 10;
        });
      const sag = sample(sagUnder);
      const sagTopMm = sample(sagTop);
      const flat = sag.every((v) => v < 0.5) && sagTopMm.every((v) => v < 0.5);
      placed.push({
        key: p.key,
        itemId: p.itemId,
        depth: p.depth,
        startMm: p.startMm,
        endMm: p.endMm,
        bottomMm,
        heightMm: p.thicknessMm,
        relaxedMm: settled.get(p.key)?.thicknessMm ?? p.thicknessMm,
        settledMm: settled.get(p.key)?.settledThicknessMm ?? p.thicknessMm,
        status: p.status,
        hatched: p.status !== "ok",
        pressed: { top: false, front: false, back: false },
        sagMm: flat ? [] : sag,
        sagTopMm: flat ? [] : sagTopMm,
      });
    }
    for (const { i0, top } of tops) top.forEach((t, k) => (support[i0 + k] = Math.max(support[i0 + k], t)));
    i = j;
  }
  // Contacts, once everything rests: a face is pressed by what touches it.
  const overlap = (a: AlongSlab, b: AlongSlab) => Math.min(a.endMm, b.endMm) - Math.max(a.startMm, b.startMm);
  const sideBySide = (a: AlongSlab, b: AlongSlab) =>
    Math.min(a.bottomMm + a.heightMm, b.bottomMm + b.heightMm) - Math.max(a.bottomMm, b.bottomMm) > 0.3 * Math.min(a.heightMm, b.heightMm);
  const touch = SEAM_MM + 1;
  for (const p of placed) {
    p.pressed = {
      top: placed.some((q) => q.depth < p.depth && overlap(p, q) > SEAM_MM),
      front: p.startMm <= touch || placed.some((q) => q !== p && Math.abs(p.startMm - q.endMm) <= touch && sideBySide(p, q)),
      back: p.endMm >= lengthMm - touch || placed.some((q) => q !== p && Math.abs(q.startMm - p.endMm) <= touch && sideBySide(p, q)),
    };
  }
  return placed;
}

/** Two passes of a moving average `half` samples either side, ends held: about a Gaussian. */
function smoothed(values: Float64Array, half: number): Float64Array {
  let cur = values;
  for (let pass = 0; pass < 2; pass++) {
    const next = new Float64Array(cur.length);
    for (let k = 0; k < cur.length; k++) {
      let sum = 0;
      let count = 0;
      for (let q = Math.max(0, k - half); q <= Math.min(cur.length - 1, k + half); q++) {
        sum += cur[q];
        count++;
      }
      next[k] = sum / count;
    }
    cur = next;
  }
  return cur;
}

/** Where the cut is taken, for a caption: "along · center". */
export function cutLabel(cut: Cut): string {
  return `along · ${cut.section}`;
}

const mm = (n: number) => `${Math.round(n)} mm`;

/**
 * Why a slab is as thick as it draws, from the Settings value to the cut:
 * `"30 mm drawn: 45 mm for Size M (not in Settings — family default) → 30 mm at Size XS"`,
 * then `→ … spread along the Section` and `→ … squeezed to close` where those
 * apply. Pouch thicknesses are entered for the reference Size and scale by
 * the gusset (`sizeFactors`); the settle thins a pouch that spreads; the fit
 * squeezes a stack taller than its budget.
 */
export function slabThicknessNote(slab: AlongSlab, size: PillowSize, resolved?: ResolvedDims): string {
  const steps: string[] = [];
  if (resolved) {
    const from =
      resolved.source === "configured"
        ? "Settings"
        : resolved.source === "measured"
          ? `measured ${resolved.measuredOn}`
          : "not in Settings — family default";
    steps.push(`${mm(resolved.dims.thicknessMm)} for Size ${REFERENCE_SIZE} (${from})`);
  }
  if (!resolved || size !== REFERENCE_SIZE) steps.push(`${mm(slab.relaxedMm)} at Size ${size}`);
  if (slab.settledMm < slab.relaxedMm - 0.5) steps.push(`${mm(slab.settledMm)} spread along the Section`);
  if (slab.heightMm < slab.settledMm - 0.5) steps.push(`${mm(slab.heightMm)} squeezed to close`);
  return `${mm(slab.heightMm)} drawn: ${steps.join(" → ")}`;
}
