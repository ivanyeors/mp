/**
 * Where each pouch stands front ↔ back in its Section (X-ray pillow UX slice
 * 11, ADR 0019), for both x-ray views and the fit. Display-and-fit only: the
 * authored Placements — the cell each pouch was put in, the pack list, the
 * fingerprint — are never touched.
 *
 * True size (Ivan, 9-11-2026): a pouch stands at its own length, as Settings
 * measured it. It used to be cut to its cell (a Size M cell is 110 mm, most
 * pouches 130–150 mm) and, beside an empty cell, slumped past its length into
 * it — so the drawn width : length never matched the one set. Now neighbours
 * that do not fit end to end overlap at their ends, and the fit marks those
 * cells compressed; an empty cell beside a pouch stays empty.
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
  /** Its footprint once settled: the authored extent (at most a cell) plus the spread each way, mm. */
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
 * - never cut to its cell (a Size M cell is 110 mm, most pouches are longer):
 *   where neighbours do not fit end to end, their ends overlap, and the fit
 *   marks those cells compressed (`fitPillow`);
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
    const work: { p: PillowPlacement; col: number; depth: number; dims: PouchDimensions; reachFrom: number; reachTo: number }[] = [];
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
          work.push({ p, col, depth, dims: dimsOf(p.itemId), reachFrom, reachTo });
        }
      });
    }
    work.sort((a, b) => a.col - b.col || a.depth - b.depth || a.p.slot - b.p.slot);
    for (const w of work) {
      const along = alongMm(w.dims);
      const { startMm, endMm } = extentAlong(w.col, cellLen, along, (w.p.offsetYMm ?? 0) * alongScale, w.reachFrom, w.reachTo, active);
      const len = endMm - startMm;
      // The columns it stands in (the loft counts it there): its own, and any it covers half of — or half of itself,
      // for a pouch shorter than a cell. An end overlapping a neighbour does not stand it there.
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
