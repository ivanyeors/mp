import { SUB_SECTIONS, type Section, type SubSection } from "./core";
import type { ColumnFit, FitStatus, PillowFit } from "./fit";
import { REFERENCE_SIZE, SEAM_MM, type PillowSize, type ResolvedDims } from "./dimensions";

export type Cut = { section: Section };

export const DEFAULT_CUT: Cut = { section: "center" };

export type CrossSectionSlab = {
  depth: number;
  heightMm: number;
  itemId: number;
  status: FitStatus;
  hatched: boolean;
};

export type CrossSectionColumn = {
  key: SubSection;
  label: string;
  widthMm: number;
  maxLoftMm: number;
  loftMm: number;
  status: FitStatus;
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

export function crossSectionSlabs(fit: PillowFit, cut: Cut): CrossSectionColumn[] {
  const sf = fit.sections[cut.section];
  return SUB_SECTIONS.map((subSection) => columnOf(subSection, fit.settle.cellLengthMm, sf.maxLoftMm, sf.columns[subSection]));
}

export type AlongSlab = {
  key: string;
  itemId: number;
  depth: number;
  startMm: number;
  endMm: number;
  bottomMm: number;
  heightMm: number;
  relaxedMm: number;
  settledMm: number;
  status: FitStatus;
  hatched: boolean;
  pressed: { top: boolean; front: boolean; back: boolean };
  sagMm: number[];
  sagTopMm: number[];
};

export const SAG_SAMPLES = 24;
const SUPPORT_STEP_MM = 2;
const DRAPE_RADIUS = 1.2;

export function alongSlabs(fit: PillowFit, section: Section): AlongSlab[] {
  const settled = new Map(fit.settle.pieces.map((s) => [s.key, s] as const));
  const lengthMm = fit.settle.cellLengthMm * SUB_SECTIONS.length;
  const n = Math.max(Math.floor(lengthMm / SUPPORT_STEP_MM), 1) + 1;
  const at = (mm: number) => Math.min(Math.max(Math.round(mm / SUPPORT_STEP_MM), 0), n - 1);
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
      const under = smoothed(rolled, Math.max(Math.round(r / 4 / SUPPORT_STEP_MM), 1)).map((u, k) =>
        Math.min(Math.max(u, support[i0 + k], 0), bottomMm),
      );
      const sagUnder = under.map((u) => bottomMm - u);
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

export function cutLabel(cut: Cut): string {
  return `along · ${cut.section}`;
}

const mm = (n: number) => `${Math.round(n)} mm`;

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
