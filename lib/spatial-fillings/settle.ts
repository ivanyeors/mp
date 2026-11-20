import {
  cellLayerGroups,
  SECTIONS,
  SUB_SECTIONS,
  type PillowPlacement,
  type Section,
  type SubSection,
} from "./core";
import {
  dimsAtSize,
  pillowDimensions,
  sizeFactors,
  SEAM_MM,
  type PillowDimensions,
  type PillowSize,
  type PouchDimensions,
  type ResolvedDims,
} from "./dimensions";

const r1 = (n: number) => Math.round(n * 10) / 10;
const EPS = 1e-6;

export type PieceSettle = {
  key: string;
  section: Section;
  subSection: SubSection;
  slot: number;
  itemId: number;
  depth: number;
  level: number;
  spanFrom: SubSection;
  spanTo: SubSection;
  spreadFrontMm: number;
  spreadBackMm: number;
  alongMm: number;
  nudged?: true;
  reachFrom: SubSection;
  reachTo: SubSection;
  startMm: number;
  endMm: number;
  settledLengthMm: number;
  thicknessMm: number;
  minThicknessMm: number;
  settledThicknessMm: number;
};

export type PillowSettle = {
  size: PillowSize;
  active: boolean;
  cellLengthMm: number;
  pieces: PieceSettle[];
};

export type SettleContext = {
  size: string | null | undefined;
  dims?: ReadonlyMap<number, ResolvedDims>;
  pillow?: PillowDimensions;
};

export function alongMm(d: PouchDimensions): number {
  return d.lengthMm;
}

export const FABRIC_GIVE = Math.PI / 2 - 1;

function fabricGiveMm(relaxedMm: number, thicknessMm: number, minThicknessMm: number, flat: number | undefined): number {
  if (flat !== undefined) return Math.max(flat - relaxedMm, 0);
  return FABRIC_GIVE * Math.max(thicknessMm - minThicknessMm, 0);
}

export function settlePillow(placements: PillowPlacement[], ctx: SettleContext): PillowSettle {
  const pillow = ctx.pillow ?? pillowDimensions(ctx.size).dims;
  const cellLen = pillow.lengthMm / 3;
  const active = !pillow.subSectionDividers;
  const dimsOf = dimsAtSize(ctx.dims, pillow);
  const alongScale = sizeFactors(pillow).along;
  const pieces: PieceSettle[] = [];
  for (const section of SECTIONS) {
    const layersByCol = SUB_SECTIONS.map((subSection) =>
      cellLayerGroups(
        placements.filter((p) => p.section === section && p.subSection === subSection).sort((a, b) => a.slot - b.slot),
      ),
    );
    const maxDepth = Math.max(0, ...layersByCol.map((l) => l.length));
    const work: { p: PillowPlacement; col: number; depth: number; level: number; dims: PouchDimensions; reachFrom: number; reachTo: number }[] = [];
    for (let depth = 0; depth < maxDepth; depth++) {
      const free = (col: number) => layersByCol[col].length <= depth;
      layersByCol.forEach((layers, col) => {
        for (const p of layers[depth] ?? []) {
          let reachFrom = col;
          let reachTo = col;
          while (active && reachFrom > 0 && free(reachFrom - 1)) reachFrom--;
          while (active && reachTo < SUB_SECTIONS.length - 1 && free(reachTo + 1)) reachTo++;
          work.push({ p, col, depth, level: layers.length - 1 - depth, dims: dimsOf(p.itemId), reachFrom, reachTo });
        }
      });
    }
    work.sort((a, b) => a.col - b.col || a.depth - b.depth || a.p.slot - b.p.slot);
    const sectionMm = cellLen * SUB_SECTIONS.length;
    const firm = (w: (typeof work)[number]) => ctx.dims?.get(w.p.itemId)?.kind === "neck";
    const packed = (list: LayerExtent[]) => {
      if (active) for (let level = 0; level < maxDepth; level++) packLayer(list.filter((_, i) => work[i].level === level), sectionMm);
      return list;
    };
    const unNudged = () =>
      work.map((w): LayerExtent => ({ col: w.col, ...extentAlong(w.col, cellLen, alongMm(w.dims), 0, w.reachFrom, w.reachTo, active), firm: firm(w), held: false }));
    const home = work.some((w) => w.p.offsetYMm) ? packed(unNudged()) : null;
    const extents = packed(
      work.map((w, i): LayerExtent => {
        const offsetMm = (w.p.offsetYMm ?? 0) * alongScale;
        if (!active) return { col: w.col, ...extentAlong(w.col, cellLen, alongMm(w.dims), offsetMm, w.reachFrom, w.reachTo, active), firm: firm(w), held: false };
        const own = { col: w.col, ...extentAlong(w.col, cellLen, alongMm(w.dims), 0, w.reachFrom, w.reachTo, active), firm: firm(w), held: false };
        if (!offsetMm || !home) return own;
        const h = home[i];
        const len = h.endMm - h.startMm;
        const lo = w.reachFrom * cellLen;
        const hi = (w.reachTo + 1) * cellLen;
        if (hi - lo < len - 0.5) return { ...h, held: false };
        const centre = Math.min(Math.max((h.startMm + h.endMm) / 2 + offsetMm, lo + len / 2), hi - len / 2);
        return { col: w.col, startMm: centre - len / 2, endMm: centre + len / 2, firm: h.firm, held: true };
      }),
    );
    for (const [i, w] of work.entries()) {
      const along = alongMm(w.dims);
      const { startMm, endMm } = extents[i];
      const len = endMm - startMm;
      const need = Math.min(cellLen, len) / 2 - EPS;
      const covers = (c: number) => Math.min(endMm, (c + 1) * cellLen) - Math.max(startMm, c * cellLen) >= need;
      let spanFrom = w.col;
      let spanTo = w.col;
      while (spanFrom > 0 && covers(spanFrom - 1)) spanFrom--;
      while (spanTo < SUB_SECTIONS.length - 1 && covers(spanTo + 1)) spanTo++;
      const nudged = Boolean(w.p.offsetYMm);
      pieces.push({
        key: `${section}/${w.p.subSection}/${w.p.slot}`,
        section,
        subSection: w.p.subSection,
        slot: w.p.slot,
        itemId: w.p.itemId,
        depth: w.depth,
        level: w.level,
        spanFrom: SUB_SECTIONS[spanFrom],
        spanTo: SUB_SECTIONS[spanTo],
        spreadFrontMm: 0,
        spreadBackMm: 0,
        alongMm: r1(along),
        ...(nudged ? { nudged: true as const } : {}),
        reachFrom: SUB_SECTIONS[w.reachFrom],
        reachTo: SUB_SECTIONS[w.reachTo],
        startMm: r1(startMm),
        endMm: r1(endMm),
        settledLengthMm: r1(len),
        thicknessMm: r1(w.dims.thicknessMm),
        minThicknessMm: r1(Math.min(w.dims.minThicknessMm, w.dims.thicknessMm)),
        settledThicknessMm: r1(w.dims.thicknessMm),
      });
    }
  }
  return { size: pillow.size, active, cellLengthMm: r1(cellLen), pieces };
}

export type LayerExtent = {
  col: number;
  startMm: number;
  endMm: number;
  firm: boolean;
  held: boolean;
};

type LayerColumn = { members: LayerExtent[]; S: number; E: number; G: number; firm: number; held: boolean };

export function packLayer(layer: LayerExtent[], sectionMm: number): void {
  const cols = [...new Set(layer.map((e) => e.col))].sort((a, b) => a - b);
  if (cols.length < 2) return;
  const groups = cols.map((col): LayerColumn => {
    const members = layer.filter((e) => e.col === col);
    const S = Math.min(...members.map((e) => e.startMm));
    const E = Math.max(...members.map((e) => e.endMm));
    const firm = Math.max(0, ...members.filter((e) => e.firm).map((e) => e.endMm - e.startMm));
    return { members, S, E, G: E - S, firm, held: members.some((e) => e.held) };
  });
  if (groups.every((g, i) => i === 0 || groups[i - 1].E <= g.S + EPS)) return;
  let heldTo = 0;
  for (const g of groups) {
    if (!g.held) continue;
    if (g.S < heldTo - EPS) g.held = false;
    else heldTo = g.E;
  }
  let from = 0;
  let a = 0;
  for (let i = 0; i <= groups.length; i++) {
    if (i < groups.length && !groups[i].held) continue;
    packRun(groups.slice(from, i), a, i < groups.length ? groups[i].S : sectionMm);
    if (i < groups.length) a = groups[i].E;
    from = i + 1;
  }
}

function packRun(groups: LayerColumn[], a: number, b: number): void {
  if (groups.length === 0) return;
  if (groups.every((g, i) => g.S >= (i ? groups[i - 1].E : a) - EPS) && groups[groups.length - 1].E <= b + EPS) return;
  const total = groups.reduce((t, g) => t + g.G, 0);
  const move = (g: LayerColumn, by: number) => {
    for (const e of g.members) {
      e.startMm += by;
      e.endMm += by;
    }
  };
  if (total <= b - a + EPS) {
    const before = groups.map((_, i) => groups.slice(0, i).reduce((t, g) => t + g.G, 0));
    const blocks: { sum: number; n: number }[] = [];
    groups.forEach((g, i) => {
      blocks.push({ sum: g.S - before[i], n: 1 });
      while (blocks.length > 1 && blocks[blocks.length - 2].sum / blocks[blocks.length - 2].n > blocks[blocks.length - 1].sum / blocks[blocks.length - 1].n) {
        const last = blocks.pop()!;
        blocks[blocks.length - 1].sum += last.sum;
        blocks[blocks.length - 1].n += last.n;
      }
    });
    const u = blocks.flatMap((k) => Array<number>(k.n).fill(Math.min(Math.max(k.sum / k.n, a), Math.max(b - total, a))));
    groups.forEach((g, i) => move(g, u[i] + before[i] - g.S));
    return;
  }
  const short = total - Math.max(b - a, 0);
  const give = groups.map((g) => Math.max(g.G - g.firm, 0));
  const canGive = give.reduce((t, v) => t + v, 0);
  const first = Math.min(short, canGive);
  const shrink = give.map((v) => (canGive > 0 ? (first * v) / canGive : 0));
  const left = groups.map((g, i) => g.G - shrink[i]);
  const leftTotal = left.reduce((t, v) => t + v, 0);
  if (short > first && leftTotal > 0) left.forEach((v, i) => (shrink[i] += ((short - first) * v) / leftTotal));
  let at = a;
  groups.forEach((g, i) => {
    const G2 = Math.max(g.G - shrink[i], 0);
    const scale = g.G > 0 ? G2 / g.G : 0;
    for (const e of g.members) {
      const len = e.endMm - e.startMm;
      const len2 = e.firm ? Math.min(len, G2) : len * scale;
      const centre = at + ((e.startMm + e.endMm) / 2 - g.S) * scale;
      const start = Math.min(Math.max(centre - len2 / 2, at), at + G2 - len2);
      e.startMm = start;
      e.endMm = start + len2;
    }
    at += G2;
  });
}

export function extentAlong(
  col: number,
  cellLen: number,
  alongMm: number,
  offsetMm: number,
  reachFrom = col,
  reachTo = col,
  active = true,
): { startMm: number; endMm: number } {
  const sectionLen = cellLen * SUB_SECTIONS.length;
  const lo = (active ? reachFrom : col) * cellLen;
  const hi = ((active ? reachTo : col) + 1) * cellLen;
  const len = Math.max(Math.min(alongMm, active ? sectionLen : cellLen), 0);
  const keep = (c: number) => Math.min(Math.max(c, lo + len / 2), hi - len / 2);
  const centre = hi - lo >= len ? keep(keep(col * cellLen + cellLen / 2) + offsetMm) : (lo + hi) / 2;
  const startMm = Math.min(Math.max(centre - len / 2, 0), sectionLen - len);
  return { startMm, endMm: startMm + len };
}

export function authoredStartMm(col: number, cellLen: number, alongMm: number, offsetMm: number): number {
  return extentAlong(col, cellLen, alongMm, offsetMm, 0, SUB_SECTIONS.length - 1).startMm;
}

export const subSectionIndex = (s: SubSection): number => SUB_SECTIONS.indexOf(s);

export function spans(s: PieceSettle, subSection: SubSection): boolean {
  const b = subSectionIndex(subSection);
  return subSectionIndex(s.spanFrom) <= b && b <= subSectionIndex(s.spanTo);
}

export function bolsterSpreadCapacityMm(d: PouchDimensions): number {
  const minT = Math.min(d.minThicknessMm, d.thicknessMm);
  const byVolume = minT > 0 ? d.widthMm * (d.thicknessMm / minT - 1) : 0;
  const byFabric = fabricGiveMm(d.widthMm, d.thicknessMm, minT, d.flatWidthMm);
  return Math.max(Math.min(byVolume, byFabric), 0);
}

export function bolsterSettledThicknessMm(d: PouchDimensions, settledWidthMm: number): number {
  if (settledWidthMm <= d.widthMm + EPS) return d.thicknessMm;
  return Math.max(Math.min(d.minThicknessMm, d.thicknessMm), (d.thicknessMm * d.widthMm) / settledWidthMm);
}

export type BolsterPieceSettle = {
  slot: number;
  itemId: number;
  widthMm: number;
  spreadMm: number;
  settledWidthMm: number;
  thicknessMm: number;
  minThicknessMm: number;
  settledThicknessMm: number;
};

export function settleBolster(
  pieces: readonly { slot: number; itemId: number; dims: PouchDimensions }[],
  lengthMm: number,
): BolsterPieceSettle[] {
  const n = pieces.length;
  const relaxed = pieces.reduce((s, p) => s + p.dims.widthMm, 0) + SEAM_MM * Math.max(n - 1, 0);
  const slack = Math.max(lengthMm - relaxed, 0);
  const end = slack / 2;
  return pieces.map((p, i) => {
    const cap = bolsterSpreadCapacityMm(p.dims);
    let spread = 0;
    if (n === 1) spread = Math.min(cap, slack);
    else if (i === 0 || i === n - 1) spread = Math.min(cap, end);
    spread = spread > EPS ? spread : 0;
    const settledWidth = p.dims.widthMm + spread;
    return {
      slot: p.slot,
      itemId: p.itemId,
      widthMm: r1(p.dims.widthMm),
      spreadMm: r1(spread),
      settledWidthMm: r1(settledWidth),
      thicknessMm: r1(p.dims.thicknessMm),
      minThicknessMm: r1(Math.min(p.dims.minThicknessMm, p.dims.thicknessMm)),
      settledThicknessMm: r1(bolsterSettledThicknessMm(p.dims, settledWidth)),
    };
  });
}
