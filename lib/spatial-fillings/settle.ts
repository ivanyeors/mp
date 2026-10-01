/**
 * Natural settle (X-ray pillow UX slice 11, ADR 0019): what the chamber does
 * with an empty sub-section. The protector walls the three Sections and
 * nothing else, so a pouch beside an empty neighbouring sub-section of its
 * own Section and Layer spreads front-to-back into it, thinning by volume
 * and never below its minimum thickness. Display-and-fit only: the authored
 * Placements — the cell each pouch was put in, the pack list, the fingerprint
 * — are never touched.
 *
 * The rule, per Section × plane (Layer depth): the empty columns form voids;
 * each void is claimed by the occupied column(s) touching it; every claimant
 * piece spreads into it up to the smaller of the void's length and its own
 * spread capacity, `V / (across × minThickness) − along` (the fabric's flat
 * length caps that lower when the registry has it). A void claimed from both
 * ends is split pro rata by the two offers, a seam between them, so the two
 * pouches meet and stay two. A pouch that cannot fill its void stays anchored
 * at its authored end and leaves the remainder at the far end.
 *
 * ponytail: static, per plane, pro rata — the simplest deterministic rule;
 * slice 10 photographs a real slumped pouch against it. Pure + browser-safe.
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
  GENERIC_POUCH,
  pillowDimensions,
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

/** A pouch's relaxed extent along the Section (front ↔ back), from its orientation. */
export function alongMm(d: PouchDimensions): number {
  return d.orientation === "along" ? d.widthMm : d.lengthMm;
}

/**
 * How much further a pouch can spread along the Section before its fill is
 * fully compressed — the fit model's compression variable read the other way
 * — or before its fabric lies flat, whichever comes first.
 */
export function spreadCapacityMm(d: PouchDimensions): number {
  const along = alongMm(d);
  const minT = Math.min(d.minThicknessMm, d.thicknessMm);
  const byVolume = minT > 0 ? along * (d.thicknessMm / minT - 1) : 0;
  const flat = d.orientation === "along" ? d.flatWidthMm : d.flatLengthMm;
  const byFabric = flat === undefined ? Infinity : Math.max(flat - along, 0);
  return Math.max(Math.min(byVolume, byFabric), 0);
}

/** The thickness a pouch stands at once spread to `settledLengthMm`: volume conserved, never below the minimum. */
export function settledThicknessMm(d: PouchDimensions, settledLength: number): number {
  const along = alongMm(d);
  if (settledLength <= along + EPS) return d.thicknessMm;
  return Math.max(Math.min(d.minThicknessMm, d.thicknessMm), (d.thicknessMm * along) / settledLength);
}

/** Split one capacity between the void in front and the void behind: pro rata by length, the overflow to the other side. */
function offerBothWays(capacity: number, lenFront: number, lenBack: number): [number, number] {
  const total = lenFront + lenBack;
  if (total <= 0) return [0, 0];
  let front = Math.min(lenFront, (capacity * lenFront) / total);
  let back = Math.min(lenBack, (capacity * lenBack) / total);
  front = Math.min(lenFront, front + Math.max(capacity - front - back, 0));
  back = Math.min(lenBack, back + Math.max(capacity - front - back, 0));
  return [front, back];
}

type Work = {
  p: PillowPlacement;
  col: number;
  depth: number;
  dims: PouchDimensions;
  capacity: number;
  /** What the piece offers each way, then what it actually spread. */
  offerFront: number;
  offerBack: number;
  front: number;
  back: number;
};

/** One plane of one Section: which columns hold a piece, and the voids between them. */
function settlePlane(plane: (Work[] | null)[], cellLen: number): void {
  const occ = plane.map((ws) => ws !== null && ws.length > 0);
  // The void on each side of an occupied column, in cells (0 = none).
  const voidBefore = (c: number) => {
    let n = 0;
    for (let i = c - 1; i >= 0 && !occ[i]; i--) n++;
    return n;
  };
  const voidAfter = (c: number) => {
    let n = 0;
    for (let i = c + 1; i < occ.length && !occ[i]; i++) n++;
    return n;
  };
  // 1. Offers: every piece splits its capacity between the voids it touches.
  plane.forEach((ws, c) => {
    if (!ws) return;
    const lenF = voidBefore(c) * cellLen;
    const lenB = voidAfter(c) * cellLen;
    for (const w of ws) [w.offerFront, w.offerBack] = offerBothWays(w.capacity, lenF, lenB);
  });
  // 2. Each void is shared by the columns touching it; the column's offer is its furthest-reaching piece.
  let i = 0;
  while (i < occ.length) {
    if (occ[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < occ.length && !occ[j + 1]) j++;
    const length = (j - i + 1) * cellLen;
    const before = i > 0 && occ[i - 1] ? plane[i - 1]! : null;
    const after = j + 1 < occ.length && occ[j + 1] ? plane[j + 1]! : null;
    const offerA = before ? Math.max(...before.map((w) => w.offerBack)) : 0;
    const offerB = after ? Math.max(...after.map((w) => w.offerFront)) : 0;
    let shareA = Math.min(offerA, length);
    let shareB = Math.min(offerB, length);
    if (before && after && offerA + offerB > length - SEAM_MM + EPS) {
      // They meet: a seam between them, the rest split pro rata by what each offers.
      const usable = Math.max(length - SEAM_MM, 0);
      shareA = offerA + offerB > 0 ? (usable * offerA) / (offerA + offerB) : 0;
      shareB = usable - shareA;
    }
    if (before) for (const w of before) w.back = Math.min(w.offerBack, shareA);
    if (after) for (const w of after) w.front = Math.min(w.offerFront, shareB);
    i = j + 1;
  }
}

/**
 * Where every piece stands once the fill has settled. Deterministic: fixed
 * Section / column / plane order, pieces by slot, independent of input order.
 */
export function settlePillow(placements: PillowPlacement[], ctx: SettleContext): PillowSettle {
  const pillow = ctx.pillow ?? pillowDimensions(ctx.size).dims;
  const cellLen = pillow.lengthMm / 3;
  const active = !pillow.subSectionDividers;
  const dimsOf = (itemId: number): PouchDimensions => ctx.dims?.get(itemId)?.dims ?? GENERIC_POUCH;
  const pieces: PieceSettle[] = [];
  for (const section of SECTIONS) {
    const layersByCol = SUB_SECTIONS.map((subSection) =>
      cellLayerGroups(
        placements.filter((p) => p.section === section && p.subSection === subSection).sort((a, b) => a.slot - b.slot),
      ),
    );
    const maxDepth = Math.max(0, ...layersByCol.map((l) => l.length));
    const work: Work[] = [];
    for (let depth = 0; depth < maxDepth; depth++) {
      const plane = layersByCol.map((layers, col) =>
        layers[depth]
          ? layers[depth].map((p): Work => {
              const dims = dimsOf(p.itemId);
              return {
                p,
                col,
                depth,
                dims,
                capacity: active ? spreadCapacityMm(dims) : 0,
                offerFront: 0,
                offerBack: 0,
                front: 0,
                back: 0,
              };
            })
          : null,
      );
      if (active) settlePlane(plane, cellLen);
      for (const ws of plane) if (ws) work.push(...ws);
    }
    work.sort((a, b) => a.col - b.col || a.depth - b.depth || a.p.slot - b.p.slot);
    for (const w of work) {
      const along = alongMm(w.dims);
      const front = w.front > EPS ? w.front : 0;
      const back = w.back > EPS ? w.back : 0;
      const settledLength = along + front + back;
      const cellsFront = front > 0 ? Math.ceil(front / cellLen - EPS) : 0;
      const cellsBack = back > 0 ? Math.ceil(back / cellLen - EPS) : 0;
      pieces.push({
        key: `${section}/${w.p.subSection}/${w.p.slot}`,
        section,
        subSection: w.p.subSection,
        slot: w.p.slot,
        itemId: w.p.itemId,
        depth: w.depth,
        spanFrom: SUB_SECTIONS[Math.max(w.col - cellsFront, 0)],
        spanTo: SUB_SECTIONS[Math.min(w.col + cellsBack, SUB_SECTIONS.length - 1)],
        spreadFrontMm: r1(front),
        spreadBackMm: r1(back),
        alongMm: r1(along),
        settledLengthMm: r1(settledLength),
        thicknessMm: r1(w.dims.thicknessMm),
        minThicknessMm: r1(Math.min(w.dims.minThicknessMm, w.dims.thicknessMm)),
        settledThicknessMm: r1(settledThicknessMm(w.dims, settledLength)),
      });
    }
  }
  return { size: pillow.size, active, cellLengthMm: r1(cellLen), pieces };
}

/** Column index helpers for readers that walk a settled span. */
export const subSectionIndex = (s: SubSection): number => SUB_SECTIONS.indexOf(s);

/** True when the settled piece stands in the column. */
export function spans(s: PieceSettle, subSection: SubSection): boolean {
  const b = subSectionIndex(subSection);
  return subSectionIndex(s.spanFrom) <= b && b <= subSectionIndex(s.spanTo);
}

// --- Mbolster: the same rule in one dimension, along the capsule (slice 09) ----

/** How much further a pouch can spread along the capsule (its width axis) before its fill is fully compressed or its fabric lies flat. */
export function bolsterSpreadCapacityMm(d: PouchDimensions): number {
  const minT = Math.min(d.minThicknessMm, d.thicknessMm);
  const byVolume = minT > 0 ? d.widthMm * (d.thicknessMm / minT - 1) : 0;
  const byFabric = d.flatWidthMm === undefined ? Infinity : Math.max(d.flatWidthMm - d.widthMm, 0);
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
