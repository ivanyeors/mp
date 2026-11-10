/**
 * Where each pouch stands front ↔ back in its Section (X-ray pillow UX slice
 * 11, ADR 0019), for both x-ray views and the fit. Display-and-fit only: the
 * authored Placements — the cell each pouch was put in, the pack list, the
 * fingerprint — are never touched.
 *
 * True size (Ivan, 9-11-2026): a pouch stands at its own length, as Settings
 * measured it. It used to be cut to its cell (a Size M cell is 110 mm, most
 * pouches 130–150 mm) and, beside an empty cell, slumped past its length into
 * it — so the drawn width : length never matched the one set. An empty cell
 * beside a pouch stays empty.
 *
 * Stuffed, not layered (Ivan, 9-11-2026: "the front filling and the back
 * filling are supposed to collide"): neighbours of one Layer that do not fit
 * end to end are pushed apart where the Section has room, else pressed
 * shorter against each other, wall to wall, as pouches stuffed in one after
 * another are; the fit marks those cells compressed, and the soft body in
 * both views squashes them where they meet.
 *
 * The Mbolster's settle (below) still spreads along the capsule. Pure +
 * browser-safe.
 */

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
  /** `${section}/${subSection}/${slot}` — the layout's piece key. */
  key: string;
  section: Section;
  subSection: SubSection;
  slot: number;
  itemId: number;
  /** The piece's plane in its authored cell: 0 = top, compacted like the layout. */
  depth: number;
  /**
   * Its height in its cell's stack, counted from the floor (0 = the bottom Layer, which rests on the back panel).
   * Pouches at one height in neighbouring cells meet end to end and press on each other (`packLayer`).
   */
  level: number;
  /** The columns the settled pouch stands in, front → back; its own cell always. */
  spanFrom: SubSection;
  spanTo: SubSection;
  /** How far it spread toward the front / the back of the Section, mm. */
  spreadFrontMm: number;
  spreadBackMm: number;
  /** Its relaxed extent along the Section (front ↔ back), mm. */
  alongMm: number;
  /** Nudged front ↔ back by hand (a fine offset): the soft cut holds it where it was put. */
  nudged?: true;
  /**
   * The columns a hand-placed pouch may stand in: its own, and the columns
   * either side of it that hold nothing at its plane. A nudge or a drop
   * slides it anywhere in them, never into a neighbour of its own plane.
   */
  reachFrom: SubSection;
  reachTo: SubSection;
  /** Where the settled pouch starts and ends, mm from the Section's front, cut to the columns it spans. */
  startMm: number;
  endMm: number;
  /** Its extent once settled, mm: its own length (`alongMm`), or less where its Layer's neighbours press it shorter. */
  settledLengthMm: number;
  thicknessMm: number;
  minThicknessMm: number;
  /** `V / (across × settledLength)`, floored at the minimum. */
  settledThicknessMm: number;
};

export type PillowSettle = {
  size: PillowSize;
  /** False for a product whose sub-sections are physically walled: every piece is then as authored. */
  active: boolean;
  /** One sub-section's length along the Section, mm (a third of the body). */
  cellLengthMm: number;
  /** Every placed piece, in fixed order: Section, sub-section, depth, slot. */
  pieces: PieceSettle[];
};

export type SettleContext = {
  /** Any case; unknown falls back to M. */
  size: string | null | undefined;
  /** item id → resolved dimensions; an absent id is the generic pouch. */
  dims?: ReadonlyMap<number, ResolvedDims>;
  /** The Size's geometry when it is not the registry's (a walled product, a test). */
  pillow?: PillowDimensions;
};

/** A pouch's relaxed extent along the Section (front ↔ back). */
export function alongMm(d: PouchDimensions): number {
  return d.lengthMm;
}

/**
 * How much longer a pouch's side-on outline gets for each mm it is pressed
 * thinner. Seen side-on a stuffed pouch is about a stadium whose perimeter is
 * its fabric, `2·length + (π − 2)·thickness`, and fabric does not stretch: give
 * up a mm of thickness and the length gains π/2 − 1 ≈ 0.57 mm, no more.
 */
export const FABRIC_GIVE = Math.PI / 2 - 1;

/**
 * The most a pouch's fabric lets it lengthen past its relaxed size along one
 * axis: `flat` (Settings' flat length / width, the longest it lies pressed
 * flat) when measured, else the stadium's give down to its minimum thickness.
 */
function fabricGiveMm(relaxedMm: number, thicknessMm: number, minThicknessMm: number, flat: number | undefined): number {
  if (flat !== undefined) return Math.max(flat - relaxedMm, 0);
  return FABRIC_GIVE * Math.max(thicknessMm - minThicknessMm, 0);
}

/**
 * Where every piece stands front ↔ back (true size, Ivan, 9-11-2026: "it's not
 * displaying in its right width / length ratio"). A pouch is drawn at its own
 * length, as Settings measured it, in both views:
 *
 * - centred on its cell, or where a fine offset put it;
 * - its centre kept in the columns it may reach (its own, and the ones either
 *   side that hold nothing at its plane), so a nudge slides it only where its
 *   Layer leaves room; a pouch longer than that room stays centred on it;
 * - the whole of it inside its Section, so a pouch against the front or back
 *   wall is pushed in from it;
 * - never cut to its cell (a Size M cell is 110 mm, most pouches are longer),
 *   and never laid over a neighbour of its Layer: where neighbours overlap,
 *   they are pushed apart, or pressed shorter end to end when the Section has
 *   no room (`packLayer`), and the fit marks those cells compressed;
 * - never slumped longer than its length into an empty cell.
 *
 * A walled product's cells are walls: there a pouch is cut to its cell, as
 * before. Deterministic: fixed Section / column / plane order, pieces by slot.
 */
export function settlePillow(placements: PillowPlacement[], ctx: SettleContext): PillowSettle {
  const pillow = ctx.pillow ?? pillowDimensions(ctx.size).dims;
  const cellLen = pillow.lengthMm / 3;
  const active = !pillow.subSectionDividers;
  const dimsOf = dimsAtSize(ctx.dims, pillow);
  // Offsets are Size M millimetres, like every pouch dimension; the settle works in this Size's.
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
      // A column is free at this plane when it holds fewer Layers than the plane is deep.
      const free = (col: number) => layersByCol[col].length <= depth;
      layersByCol.forEach((layers, col) => {
        for (const p of layers[depth] ?? []) {
          let reachFrom = col;
          let reachTo = col;
          // A walled product's cells are walls: nothing slides out of its own.
          while (active && reachFrom > 0 && free(reachFrom - 1)) reachFrom--;
          while (active && reachTo < SUB_SECTIONS.length - 1 && free(reachTo + 1)) reachTo++;
          work.push({ p, col, depth, level: layers.length - 1 - depth, dims: dimsOf(p.itemId), reachFrom, reachTo });
        }
      });
    }
    work.sort((a, b) => a.col - b.col || a.depth - b.depth || a.p.slot - b.p.slot);
    // Where each stands on its own, then each height of the stack packed end to end: pouches that meet at one height
    // from the floor press against each other, never laid over (one higher up rests over its neighbour's end instead).
    const sectionMm = cellLen * SUB_SECTIONS.length;
    const firm = (w: (typeof work)[number]) => ctx.dims?.get(w.p.itemId)?.kind === "neck";
    const packed = (list: LayerExtent[]) => {
      if (active) for (let level = 0; level < maxDepth; level++) packLayer(list.filter((_, i) => work[i].level === level), sectionMm);
      return list;
    };
    const unNudged = () =>
      work.map((w): LayerExtent => ({ col: w.col, ...extentAlong(w.col, cellLen, alongMm(w.dims), 0, w.reachFrom, w.reachTo, active), firm: firm(w), held: false }));
    // A pouch placed by hand is moved by its offset from where it stands packed un-nudged (so every millimetre of a nudge
    // moves it, from what was drawn), at that length, inside the columns it may reach; there it holds, and its
    // neighbours make room. One longer than that room cannot move. A walled product's cells take the offset as before.
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
      // The columns it stands in (the loft counts it there): its own, and any it covers half of — or half of itself,
      // for a pouch shorter than a cell. A neighbour's end pressed into its column does not stand that neighbour there.
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

/** One pouch of a Layer as `packLayer` moves it: its column, its extent (mm from the Section's front), and how it gives. */
export type LayerExtent = {
  col: number;
  startMm: number;
  endMm: number;
  /** A Neck support: firm foam, it is not pressed shorter while a pouch still can be. */
  firm: boolean;
  /** Placed by hand, where it can move: it stays where it was put, and its neighbours make room. */
  held: boolean;
};

/** A column of one Layer as `packLayer` moves it: its pouches side by side across, pressing as one. */
type LayerColumn = { members: LayerExtent[]; S: number; E: number; G: number; firm: number; held: boolean };

/**
 * One height of a Section's stack packed end to end, as pouches are stuffed in one
 * after another (Ivan, 9-11-2026: "the front filling and the back filling are
 * supposed to collide ... compress the fillings together"). A column's pouches
 * of the Layer lie side by side across and press as one. Where columns
 * overlap as each stands on its own:
 *
 * - a column placed by hand stays where it was put, its neighbours make room
 *   (one laid over another placed by hand does not hold);
 * - between those and the Section's walls, the rest are pushed apart, end to
 *   end, by the least move, each still its own length, where there is room;
 * - where there is none, they are pressed shorter against each other, wall to
 *   wall. Each column gives its share of the shortfall by what it can give — a
 *   pouch any of its length, so pouches pressed together shorten alike; a
 *   Neck support none, being firm, until nothing else is left to give.
 *
 * Changes `layer` in place. A Layer whose columns do not overlap is left as it is.
 */
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
  // The room either side of each column placed by hand, wall to wall.
  let from = 0;
  let a = 0;
  for (let i = 0; i <= groups.length; i++) {
    if (i < groups.length && !groups[i].held) continue;
    packRun(groups.slice(from, i), a, i < groups.length ? groups[i].S : sectionMm);
    if (i < groups.length) a = groups[i].E;
    from = i + 1;
  }
}

/** Columns between `a` and `b` (a wall, or a column placed by hand) pushed apart where they fit, else pressed shorter. */
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
    // Pushed apart by the least move: each column's start less the lengths before it may never fall back (pool the
    // ones that would, at their mean), then kept between a and b.
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
  // Pressed wall to wall: the shortfall shared by what each column can give, then, if that is not enough, by length.
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

/**
 * Where a pouch `alongMm` long stands, mm from its Section's front (true
 * size): centred on its cell (`col`), the whole of it in the columns it may
 * reach, `reachFrom` … `reachTo`, then moved by its fine offset (`offsetMm`,
 * this Size's mm) within them; a pouch longer than them stays centred on
 * them. Always inside the Section. A walled cell (`active` false) cuts it to
 * the cell.
 */
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
  // Where it stands un-nudged (centred on its cell, clear of a neighbour it would reach), and the offset from there:
  // every millimetre of a nudge moves it, with no dead zone where home was pushed in.
  const keep = (c: number) => Math.min(Math.max(c, lo + len / 2), hi - len / 2);
  const centre = hi - lo >= len ? keep(keep(col * cellLen + cellLen / 2) + offsetMm) : (lo + hi) / 2;
  const startMm = Math.min(Math.max(centre - len / 2, 0), sectionLen - len);
  return { startMm, endMm: startMm + len };
}

/**
 * Where a pouch's authored extent starts, mm from its Section's front: its own
 * length centred in its cell (`col`), moved by its fine offset (`offsetMm`,
 * this Size's mm), kept in the Section. The settle's own rule, with no
 * neighbours to keep it from.
 */
export function authoredStartMm(col: number, cellLen: number, alongMm: number, offsetMm: number): number {
  return extentAlong(col, cellLen, alongMm, offsetMm, 0, SUB_SECTIONS.length - 1).startMm;
}

/** Column index helpers for readers that walk a settled span. */
export const subSectionIndex = (s: SubSection): number => SUB_SECTIONS.indexOf(s);

/** True when the settled piece stands in the column. */
export function spans(s: PieceSettle, subSection: SubSection): boolean {
  const b = subSectionIndex(subSection);
  return subSectionIndex(s.spanFrom) <= b && b <= subSectionIndex(s.spanTo);
}

// --- Mbolster: the same rule in one dimension, along the capsule (slice 09) ----

/** How much further a pouch can spread along the capsule (its width axis): what its fabric gives pressed flat, never past fully compressed. */
export function bolsterSpreadCapacityMm(d: PouchDimensions): number {
  const minT = Math.min(d.minThicknessMm, d.thicknessMm);
  const byVolume = minT > 0 ? d.widthMm * (d.thicknessMm / minT - 1) : 0;
  const byFabric = fabricGiveMm(d.widthMm, d.thicknessMm, minT, d.flatWidthMm);
  return Math.max(Math.min(byVolume, byFabric), 0);
}

/** The thickness a pouch stands at once spread to `settledWidthMm` along the capsule: volume conserved, floored at the minimum. */
export function bolsterSettledThicknessMm(d: PouchDimensions, settledWidthMm: number): number {
  if (settledWidthMm <= d.widthMm + EPS) return d.thicknessMm;
  return Math.max(Math.min(d.minThicknessMm, d.thicknessMm), (d.thicknessMm * d.widthMm) / settledWidthMm);
}

export type BolsterPieceSettle = {
  slot: number;
  itemId: number;
  widthMm: number;
  /** Into the capsule's empty end this piece touches (both ends for a lone piece), mm. */
  spreadMm: number;
  settledWidthMm: number;
  thicknessMm: number;
  minThicknessMm: number;
  settledThicknessMm: number;
};

/**
 * Pouches packed edge to edge along the capsule, centred, spread into the two
 * empty ends: the first piece into the front end, the last into the back end
 * (a lone piece into both), each up to its own capacity. Nothing between two
 * packed pouches is a void, so the middle pieces keep their relaxed width.
 */
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
