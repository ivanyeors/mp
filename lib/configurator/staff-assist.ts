/**
 * Staff assist mode (slice 04): pure rules for the size×tier confirm gate,
 * cover/case/add-on eligibility recheck on size change, and the per-cell
 * session-mix edits. No I/O — the assist panel and self-check import these.
 */

import {
  MAX_LAYERS_PER_CELL,
  MAX_PIECES_PER_CELL,
  MAX_OFFSET_MM,
  MAX_PIECES_PER_LAYER,
  placementsExactMatch,
  SECTIONS,
  SUB_SECTIONS,
  type AnyPlacement,
  type BolsterPlacement,
  type PillowPlacement,
  type Section,
  type SubSection,
} from "@/lib/spatial-fillings/core";

export const PILLOW_SIZES = ["XS", "S", "M", "L", "XL"] as const;
export const PILLOW_TIERS = ["basic", "premium"] as const;

export type PillowSize = (typeof PILLOW_SIZES)[number];
export type PillowTier = (typeof PILLOW_TIERS)[number];
export type SizeTier = { size: PillowSize; tier: PillowTier };

export type Cell = { section: Section; subSection: SubSection };

/** The nine Mpillow cells (Section × sub-section) in display order. */
export const PILLOW_CELLS: readonly Cell[] = SECTIONS.flatMap((section) =>
  SUB_SECTIONS.map((subSection) => ({ section, subSection })),
);

// --- Size×tier confirm gate -------------------------------------------------

export type ConfirmGateState = { pending: SizeTier | null };
export type ConfirmGateEvent =
  | { type: "request"; current: SizeTier; next: SizeTier }
  | { type: "cancel" }
  | { type: "confirm" };

/**
 * Confirm-gate state machine: a size/tier change only ever applies through
 * request → confirm. Cancel (or requesting the unchanged size×tier) yields
 * `apply: null`, so placements stay untouched.
 */
export function confirmGate(
  state: ConfirmGateState,
  event: ConfirmGateEvent,
): { state: ConfirmGateState; apply: SizeTier | null } {
  switch (event.type) {
    case "request": {
      const unchanged =
        event.current.size === event.next.size && event.current.tier === event.next.tier;
      return { state: { pending: unchanged ? null : event.next }, apply: null };
    }
    case "cancel":
      return { state: { pending: null }, apply: null };
    case "confirm":
      return { state: { pending: null }, apply: state.pending };
  }
}

// --- Size-change eligibility recheck (cover/case/add-ons) --------------------

export type OfferedOption = { item_id: number; stock_available: number };
export type SelectedItem = { itemId: number; name: string };

export type SizeRecheckInput = {
  cover: SelectedItem | null;
  caseSel: SelectedItem | null;
  addons: SelectedItem[];
  /** Options offered for the NEW size (server already size-filters these). */
  offeredCovers: ReadonlyArray<OfferedOption>;
  offeredCases: ReadonlyArray<OfferedOption>;
  offeredAddonIds: ReadonlyArray<number>;
};

export type SizeRecheckResult = {
  coverId: number | null;
  caseId: number | null;
  addonIds: number[];
  /** Cleared because the Item is not offered for the new size — show a visible note. */
  clearedNames: string[];
  /** Kept although stock is 0 — existing out-of-stock/Pre-order signals apply. */
  keptOutOfStockNames: string[];
};

/**
 * Rule (PRD): not offered for the new size → auto-clear + note; offered but
 * stock 0 → keep the selection and let the existing OOS/Pre-order machinery
 * (allowSoldOut picker + isPreOrder trigger) do the signalling.
 */
export function recheckSelectionsForSize(input: SizeRecheckInput): SizeRecheckResult {
  const clearedNames: string[] = [];
  const keptOutOfStockNames: string[] = [];

  const check = (
    sel: SelectedItem | null,
    offered: ReadonlyArray<OfferedOption>,
  ): number | null => {
    if (!sel) return null;
    const hit = offered.find((o) => o.item_id === sel.itemId);
    if (!hit) {
      clearedNames.push(sel.name);
      return null;
    }
    if (hit.stock_available <= 0) keptOutOfStockNames.push(sel.name);
    return sel.itemId;
  };

  const coverId = check(input.cover, input.offeredCovers);
  const caseId = check(input.caseSel, input.offeredCases);

  const offeredAddons = new Set(input.offeredAddonIds);
  const addonIds: number[] = [];
  for (const addon of input.addons) {
    if (offeredAddons.has(addon.itemId)) addonIds.push(addon.itemId);
    else clearedNames.push(addon.name);
  }

  return { coverId, caseId, addonIds, clearedNames, keptOutOfStockNames };
}

// --- Starting template & what a size×tier change does to the mix -------------

/** The engine's Filling Template, scoped to the size it recommended. */
export type TemplateSuggestion = { size: string; templateId: number };

/**
 * The engine's pick from a Recommendation record, or null when it named no
 * catalog template (a legacy bootstrap record, or a stub string id).
 */
export function templateSuggestion(
  record: { size: string | null; templateId: string | null } | null,
): TemplateSuggestion | null {
  const id = Number(record?.templateId);
  if (!record?.size || !Number.isInteger(id) || id <= 0) return null;
  return { size: String(record.size), templateId: id };
}

/**
 * The template a size starts from: the engine's suggestion on the size it
 * recommended, else that size's default. A Filling Template is scoped by size,
 * so the suggestion never follows Staff onto another size.
 */
export function startingTemplateId(
  size: string,
  suggestion: TemplateSuggestion | null,
  defaultTemplateId: number | null,
): number | null {
  return suggestion?.size === size ? suggestion.templateId : defaultTemplateId;
}

/**
 * The mix after a confirmed size×tier change, or null when a size change means
 * starting over from that size's template. A tier-only change keeps the mix —
 * templates are scoped by size, never by tier — except that a basic pillow
 * cannot take a neck support or an ear pad (the hold refuses one), so those
 * pieces go.
 */
export function mixAfterTierChange(
  current: SizeTier,
  next: SizeTier,
  placements: PillowPlacement[],
  isNeckSupport: (itemId: number) => boolean,
): { placements: PillowPlacement[]; removed: number } | null {
  if (current.size !== next.size) return null;
  if (next.tier === "premium") return { placements, removed: 0 };
  const kept = placements.filter((p) => !isNeckSupport(p.itemId));
  return { placements: kept, removed: placements.length - kept.length };
}

// --- Session mix (per-cell list editor, v1) ----------------------------------

function inCell(p: PillowPlacement, cell: Cell): boolean {
  return p.section === cell.section && p.subSection === cell.subSection;
}

/** Pieces in one cell, sorted by slot. */
export function cellPieces(placements: PillowPlacement[], cell: Cell): PillowPlacement[] {
  return placements.filter((p) => inCell(p, cell)).sort((a, b) => a.slot - b.slot);
}

// --- Layers (cell depth planes) ----------------------------------------------

/** A piece's layer: `row` when set, else layer 0 — the single-layer default. */
export const layerOf = (p: PillowPlacement) => p.row ?? 0;

/** Drop `row`, the canonical encoding for a cell that is one layer deep. */
function withoutRow(p: PillowPlacement): PillowPlacement {
  const { row: _dropped, ...rest } = p;
  return rest;
}

/**
 * A cell's layers, top→deep: index = the layer Staff see, contents sorted by
 * slot. Stored `row` values are COMPACTED on read, so a hole left by a deleted
 * layer never shows as an empty one. Every mutation below writes them back
 * dense, so the displayed index and the stored depth agree after any edit.
 */
export function cellLayers(placements: PillowPlacement[], cell: Cell): PillowPlacement[][] {
  const byRow = new Map<number, PillowPlacement[]>();
  for (const p of cellPieces(placements, cell)) {
    const list = byRow.get(layerOf(p));
    if (list) list.push(p);
    else byRow.set(layerOf(p), [p]);
  }
  return [...byRow.entries()].sort(([a], [b]) => a - b).map(([, list]) => list);
}

/** Renumber a cell's layers to a dense 0..n-1; a single layer loses `row`. */
function compactLayers(placements: PillowPlacement[], cell: Cell): PillowPlacement[] {
  const layers = cellLayers(placements, cell);
  if (layers.length <= 1) return placements.map((p) => (inCell(p, cell) ? withoutRow(p) : p));
  return applyLayerOrder(placements, cell, layers);
}

/** Write `row` from an ordered list of layers (index = depth). */
function applyLayerOrder(
  placements: PillowPlacement[],
  cell: Cell,
  order: PillowPlacement[][],
): PillowPlacement[] {
  const rowBySlot = new Map<number, number>();
  order.forEach((layer, depth) => layer.forEach((p) => rowBySlot.set(p.slot, depth)));
  return placements.map((p) => (inCell(p, cell) ? { ...p, row: rowBySlot.get(p.slot) ?? 0 } : p));
}

/**
 * Add one piece into the lowest free slot of `layer`. Passing `layers.length`
 * adds a new layer under the deepest one — that is the whole of "add a layer",
 * so an empty layer is never created and never has to be persisted.
 *
 * `layer: null` (or omitted) means "anywhere in this cell": the topmost layer
 * with room, else a new one. That is what a click on the cell art asks for, and
 * resolving it here rather than in the renderer is why such a click cannot
 * dead-end on a full top layer while the cell still has room.
 */
export function addPiece(
  placements: PillowPlacement[],
  cell: Cell,
  itemId: number,
  layer: number | null = null,
): { ok: true; placements: PillowPlacement[] } | { ok: false; error: string } {
  const layers = cellLayers(placements, cell);
  const target =
    layer ?? Math.min(layers.findIndex((l) => l.length < MAX_PIECES_PER_LAYER), layers.length);
  // findIndex returns -1 when every layer is full; min() then keeps -1, so fall
  // back to a new layer under the deepest.
  const at = target < 0 ? layers.length : target;
  if (at > layers.length || at >= MAX_LAYERS_PER_CELL) {
    return { ok: false, error: `Max ${MAX_LAYERS_PER_CELL} layers per cell` };
  }
  if ((layers[at]?.length ?? 0) >= MAX_PIECES_PER_LAYER) {
    return { ok: false, error: `Max ${MAX_PIECES_PER_LAYER} pieces per layer` };
  }
  const used = new Set(placements.filter((p) => inCell(p, cell)).map((p) => p.slot));
  if (used.size >= MAX_PIECES_PER_CELL) {
    return { ok: false, error: `Max ${MAX_PIECES_PER_CELL} pieces per cell` };
  }
  let slot = 1;
  while (used.has(slot)) slot += 1;
  const next = [...placements, { section: cell.section, subSection: cell.subSection, slot, itemId, row: at }];
  return { ok: true, placements: compactLayers(next, cell) };
}

/** Remove the piece at (cell, slot); a layer emptied by it closes up. */
export function removePiece(
  placements: PillowPlacement[],
  cell: Cell,
  slot: number,
): PillowPlacement[] {
  return compactLayers(placements.filter((p) => !(inCell(p, cell) && p.slot === slot)), cell);
}

/** Remove a whole layer and everything in it; deeper layers move up. */
export function removeLayer(
  placements: PillowPlacement[],
  cell: Cell,
  layer: number,
): PillowPlacement[] {
  const doomed = new Set((cellLayers(placements, cell)[layer] ?? []).map((p) => p.slot));
  if (doomed.size === 0) return placements;
  return compactLayers(placements.filter((p) => !(inCell(p, cell) && doomed.has(p.slot))), cell);
}

/** Move a layer to another depth (drag result); everything between shifts. */
export function moveLayer(
  placements: PillowPlacement[],
  cell: Cell,
  from: number,
  to: number,
): PillowPlacement[] {
  const layers = cellLayers(placements, cell);
  if (from === to || from < 0 || to < 0 || from >= layers.length || to >= layers.length) {
    return placements;
  }
  const order = [...layers];
  order.splice(to, 0, ...order.splice(from, 1));
  return applyLayerOrder(placements, cell, order);
}

// --- Per-piece moves (X-ray pillow UX slice 06) --------------------------------

/** One piece, addressed by its cell and slot — the key the layout and the fit use. */
export type PieceRef = Cell & { slot: number };

/** Where a move puts a piece: a cell, optionally a Layer (`null` / omitted = the topmost with room, else a new one) and a position in it. */
export type MoveTarget = { cell: Cell; layer?: number | null; index?: number };

export type MoveResult =
  | { ok: true; placements: PillowPlacement[]; ref: PieceRef }
  | { ok: false; error: string };

const sameCell = (a: Cell, b: Cell) => a.section === b.section && a.subSection === b.subSection;

/** The lowest free slot in a cell. */
function freeSlot(placements: PillowPlacement[], cell: Cell): number {
  const used = new Set(placements.filter((p) => inCell(p, cell)).map((p) => p.slot));
  let slot = 1;
  while (used.has(slot)) slot += 1;
  return slot;
}

/**
 * Put a Layer's pieces in `order` by rewriting their slots: a Layer's position
 * is slot order, so the pieces trade the slots the Layer already holds. Slot
 * is unique per CELL, so nothing outside the Layer moves; the fingerprint and
 * the pack list ignore slots, so nothing downstream moves either.
 */
function writeLayerOrder(placements: PillowPlacement[], cell: Cell, order: PillowPlacement[]): PillowPlacement[] {
  const slots = order.map((p) => p.slot).sort((a, b) => a - b);
  const slotFor = new Map(order.map((p, i) => [p.slot, slots[i]]));
  return placements.map((p) => (inCell(p, cell) && slotFor.has(p.slot) ? { ...p, slot: slotFor.get(p.slot)! } : p));
}

/**
 * Move one piece to a cell, Layer and position. Re-slots in the target cell
 * (its own slot when the cell is unchanged, else the lowest free one),
 * compacts the Layers of both cells, keeps `insertOrder` while the Section is
 * unchanged and drops it otherwise (the assembly sequence never names a pouch
 * that left). Refuses with `addPiece`'s shapes when the target Layer is full
 * or the cell is at its cap. Fit never refuses: an overfull cell only warns.
 */
export function movePiece(
  placements: PillowPlacement[],
  ref: PieceRef,
  to: MoveTarget,
): MoveResult {
  const moving = placements.find((p) => inCell(p, ref) && p.slot === ref.slot);
  if (!moving) return { ok: false, error: `No piece at ${ref.section} ${ref.subSection} slot ${ref.slot}` };
  const staying = sameCell(ref, to.cell);
  // Staying, the Layer it leaves may close: renumber first, so `to.layer` (an
  // index into the Layers left behind) is also the stored row it joins.
  const lifted = placements.filter((p) => p !== moving);
  const without = staying ? compactLayers(lifted, to.cell) : lifted;
  const layers = cellLayers(without, to.cell);
  const target = to.layer ?? Math.min(layers.findIndex((l) => l.length < MAX_PIECES_PER_LAYER), layers.length);
  const at = target < 0 ? layers.length : target;
  if (at > layers.length || at >= MAX_LAYERS_PER_CELL) {
    return { ok: false, error: `Max ${MAX_LAYERS_PER_CELL} layers per cell` };
  }
  if ((layers[at]?.length ?? 0) >= MAX_PIECES_PER_LAYER) {
    return { ok: false, error: `Max ${MAX_PIECES_PER_LAYER} pieces per layer` };
  }
  if (!staying && without.filter((p) => inCell(p, to.cell)).length >= MAX_PIECES_PER_CELL) {
    return { ok: false, error: `Max ${MAX_PIECES_PER_CELL} pieces per cell` };
  }
  const slot = staying ? moving.slot : freeSlot(without, to.cell);
  const sameSection = ref.section === to.cell.section;
  // A fine offset is a position in the cell it was set in: a new cell starts at home.
  const { insertOrder, offsetXMm, offsetYMm, ...rest } = moving;
  const placed: PillowPlacement = {
    ...rest,
    ...(staying && offsetXMm !== undefined ? { offsetXMm } : {}),
    ...(staying && offsetYMm !== undefined ? { offsetYMm } : {}),
    section: to.cell.section,
    subSection: to.cell.subSection,
    slot,
    row: at,
    ...(sameSection && insertOrder !== undefined ? { insertOrder } : {}),
  };
  let next = compactLayers([...without, placed], to.cell);
  if (!staying) next = compactLayers(next, ref);
  if (to.index !== undefined) {
    // Position i of a Layer holds its i-th lowest slot, so the moved piece's
    // new slot is known before the rewrite.
    const layer = cellLayers(next, to.cell).find((l) => l.some((p) => p.slot === slot)) ?? [];
    const others = layer.filter((p) => p.slot !== slot);
    const index = Math.max(0, Math.min(to.index, others.length));
    const slots = layer.map((p) => p.slot).sort((a, b) => a - b);
    next = writeLayerOrder(next, to.cell, [...others.slice(0, index), layer.find((p) => p.slot === slot)!, ...others.slice(index)]);
    return { ok: true, placements: next, ref: { section: to.cell.section, subSection: to.cell.subSection, slot: slots[index] ?? slot } };
  }
  return { ok: true, placements: next, ref: { section: to.cell.section, subSection: to.cell.subSection, slot } };
}

/**
 * One Layer up (−1, toward the top) or down (+1, deeper): the adjacent Layer,
 * a new one under the deepest when needed; the Layer it leaves closes up if
 * empty. Already at the top going up is a no-op that returns the input.
 */
export function shiftPieceLayer(placements: PillowPlacement[], ref: PieceRef, dir: 1 | -1): MoveResult {
  const moving = placements.find((p) => inCell(p, ref) && p.slot === ref.slot);
  if (!moving) return { ok: false, error: `No piece at ${ref.section} ${ref.subSection} slot ${ref.slot}` };
  const depth = layerOf(moving);
  const layers = cellLayers(placements, ref);
  // A single piece in its own Layer has nothing below it to swap with: moving
  // it "down" would only recreate the same Layer one step deeper.
  const alone = (layers[depth]?.length ?? 0) === 1;
  const target = depth + dir;
  if (target < 0 || (dir === 1 && alone && depth === layers.length - 1)) return { ok: true, placements, ref };
  // Leaving a Layer alone shifts the deeper ones up by one on compaction, so
  // the piece lands one deeper than its old index only when the Layer stays.
  const landing = dir === 1 && alone ? target - 1 : target;
  return movePiece(placements, ref, { cell: ref, layer: landing });
}

/**
 * Swap the piece with its neighbour in its Layer: left (−1) or right (+1).
 * At the row's end there is nothing to swap with — the same array comes back.
 */
export function reorderInLayer(placements: PillowPlacement[], ref: PieceRef, dir: 1 | -1): PillowPlacement[] {
  const layer = cellLayers(placements, ref).find((l) => l.some((p) => p.slot === ref.slot));
  if (!layer) return placements;
  const i = layer.findIndex((p) => p.slot === ref.slot);
  const j = i + dir;
  if (j < 0 || j >= layer.length) return placements;
  const order = [...layer];
  [order[i], order[j]] = [order[j], order[i]];
  return writeLayerOrder(placements, ref, order);
}

/** The ref the piece holds after `reorderInLayer(placements, ref, dir)`: the neighbour's slot, or its own at the row's end. */
export function reorderedRef(placements: PillowPlacement[], ref: PieceRef, dir: 1 | -1): PieceRef {
  const layer = cellLayers(placements, ref).find((l) => l.some((p) => p.slot === ref.slot));
  if (!layer) return ref;
  const j = layer.findIndex((p) => p.slot === ref.slot) + dir;
  if (j < 0 || j >= layer.length) return ref;
  return { ...ref, slot: layer[j].slot };
}

// --- Insert order (per Section; sub-sections and layers ignored) --------------

/**
 * A Section's pieces in assembly order: authored `insertOrder` first, then the
 * unordered ones (never dragged, or added after ordering) in reading order —
 * front→back, top layer first, then slot — so the list is stable before anyone
 * authors it and a new piece lands as the next step.
 */
export function sectionInsertOrder(placements: PillowPlacement[], section: Section): PillowPlacement[] {
  const rank = (p: PillowPlacement) => p.insertOrder ?? Number.MAX_SAFE_INTEGER;
  return placements
    .filter((p) => p.section === section)
    .sort(
      (a, b) =>
        rank(a) - rank(b) ||
        SUB_SECTIONS.indexOf(a.subSection) - SUB_SECTIONS.indexOf(b.subSection) ||
        layerOf(a) - layerOf(b) ||
        a.slot - b.slot,
    );
}

/** Write a Section's `insertOrder` as 1..n from `ordered` (its pieces, e.g. a drag result). */
export function setSectionInsertOrder(
  placements: PillowPlacement[],
  section: Section,
  ordered: PillowPlacement[],
): PillowPlacement[] {
  const step = new Map(ordered.map((p, i) => [`${p.subSection}/${p.slot}`, i + 1]));
  return placements.map((p) =>
    p.section === section
      ? { ...p, insertOrder: step.get(`${p.subSection}/${p.slot}`) ?? p.insertOrder }
      : p,
  );
}

// --- X-ray arrangement (one layer side-by-side vs several stacked in depth) ---

export type CellArrangement = "side" | "stacked";

/** A cell reads "stacked" once its pieces occupy more than one layer. */
export function cellArrangement(placements: PillowPlacement[], cell: Cell): CellArrangement {
  return cellLayers(placements, cell).length > 1 ? "stacked" : "side";
}

/**
 * Set a whole cell's arrangement. "side" collapses everything into one layer;
 * "stacked" spreads the pieces over up to MAX_LAYERS_PER_CELL layers in slot
 * order — one piece each while they fit, then evenly chunked, since a cell can
 * hold five times more pieces than it has layers.
 */
export function setCellArrangement(
  placements: PillowPlacement[],
  cell: Cell,
  mode: CellArrangement,
): PillowPlacement[] {
  if (mode === "side") return placements.map((p) => (inCell(p, cell) ? withoutRow(p) : p));
  const pieces = cellPieces(placements, cell);
  const perLayer = Math.max(1, Math.ceil(pieces.length / MAX_LAYERS_PER_CELL));
  const layers: PillowPlacement[][] = [];
  for (let i = 0; i < pieces.length; i += perLayer) layers.push(pieces.slice(i, i + perLayer));
  return applyLayerOrder(placements, cell, layers);
}

/** Cell pieces ordered top→deep (layer asc, then slot). */
export function cellStack(placements: PillowPlacement[], cell: Cell): PillowPlacement[] {
  return cellLayers(placements, cell).flat();
}

// --- Mirror (left ↔ right; CONTEXT.md: side-sleep support is the paired one) --

/** The Section a mirror writes into, or null for one that has no pair. */
export function mirrorTarget(from: Section): Section | null {
  return from === "left" ? "right" : from === "right" ? "left" : null;
}

/**
 * Copy one side's whole configuration onto the other, REPLACING it.
 *
 * Only left ↔ right. Mirroring is across the pillow's sagittal plane, and
 * `center` is on that plane — it has no opposite side to be the same as, so a
 * "mirror the center" would have to invent a meaning. Passing it is a no-op.
 *
 * Sub-sections are NOT flipped: front/middle/back run head→foot, perpendicular
 * to the axis being mirrored, so front stays front. Slots, layers (`row`) and
 * `insertOrder` all carry over as-is — the slot namespace is per cell, so the
 * copy cannot collide with anything, and the mirrored side is meant to be
 * assembled the same way it is filled.
 */
export function mirrorSection(placements: PillowPlacement[], from: Section): PillowPlacement[] {
  const to = mirrorTarget(from);
  if (to === null) return placements;
  const source = placements.filter((p) => p.section === from);
  if (source.length === 0) return placements; // an empty source would silently CLEAR the other side
  return [
    ...placements.filter((p) => p.section !== to),
    // Across the mirror plane: a pouch pushed to one side's outer edge lands at the other's.
    ...source.map((p) => (p.offsetXMm ? { ...p, section: to, offsetXMm: -p.offsetXMm } : { ...p, section: to })),
  ];
}

/**
 * Set a pouch's fine position in its cell (slice 08): mm from home, rounded,
 * bounded by MAX_OFFSET_MM; 0 drops the field so an un-nudged pouch stays
 * byte-identical to one that never moved. Returns the input when nothing
 * changes. The layout clamps the drawn pouch (across: its cell; front ↔ back: its Section).
 */
export function nudgePiece(placements: PillowPlacement[], ref: PieceRef, offset: { xMm: number; yMm: number }): PillowPlacement[] {
  const bound = (v: number) => Math.max(-MAX_OFFSET_MM, Math.min(MAX_OFFSET_MM, Math.round(v))) || 0;
  const x = bound(offset.xMm);
  const y = bound(offset.yMm);
  const i = placements.findIndex((p) => inCell(p, ref) && p.slot === ref.slot);
  if (i < 0) return placements;
  const p = placements[i];
  if ((p.offsetXMm ?? 0) === x && (p.offsetYMm ?? 0) === y) return placements;
  const rest: PillowPlacement = { ...p };
  delete rest.offsetXMm;
  delete rest.offsetYMm;
  const next = [...placements];
  next[i] = { ...rest, ...(x ? { offsetXMm: x } : {}), ...(y ? { offsetYMm: y } : {}) };
  return next;
}

// --- Mbolster session mix (single compartment, no cap in v1 — ADR 0008) ------

/** Add one piece into the lowest free slot — no piece cap for Mbolster in v1. */
export function addBolsterPiece(
  placements: BolsterPlacement[],
  itemId: number,
): BolsterPlacement[] {
  const used = new Set(placements.map((p) => p.slot));
  let slot = 1;
  while (used.has(slot)) slot += 1;
  return [...placements, { slot, itemId }];
}

/** Remove the bolster piece at slot. */
export function removeBolsterPiece(
  placements: BolsterPlacement[],
  slot: number,
): BolsterPlacement[] {
  return placements.filter((p) => p.slot !== slot);
}

/**
 * Remove every piece of one filling from a mix — the pack list's remove. A
 * pillow cell that loses a whole layer closes the gap, exactly as removing the
 * pieces one by one on the x-ray would.
 */
export function removeFilling<T extends AnyPlacement>(placements: T[], itemId: number): T[] {
  let next = placements.filter((p) => p.itemId !== itemId);
  for (const p of placements) {
    if (p.itemId === itemId && "section" in p) {
      next = compactLayers(next as PillowPlacement[], p) as T[];
    }
  }
  return next;
}

// --- Loaded-template tracking (for slice 05's snapshot) ----------------------

export type LoadedTemplate = { id: number; placements: AnyPlacement[] };

/**
 * `sessionFillingTemplateId`: kept only while the session mix still exactly
 * matches the loaded catalog template; any diverging edit clears it.
 */
export function sessionTemplateId(
  loaded: LoadedTemplate | null,
  session: AnyPlacement[],
): number | null {
  if (!loaded) return null;
  return placementsExactMatch(loaded.placements, session) ? loaded.id : null;
}

// --- Saving an edited mix back to the catalog -------------------------------

export type SaveAffordance = {
  /** The session mix differs from the loaded template, or none is loaded. */
  dirty: boolean;
  /** There is a loaded template whose placements can be replaced in place. */
  canOverwrite: boolean;
  /** The mix can be published as a new catalog template. */
  canSaveNew: boolean;
};

/**
 * What the staff toolbox may offer for the current mix. A mix that still
 * exactly matches its loaded template has nothing to save — saving it new
 * would only duplicate the catalog entry it already matches — and a mix built
 * from scratch has no template to overwrite, only a new one to create.
 */
export function saveAffordance(opts: {
  placements: AnyPlacement[];
  loaded: LoadedTemplate | null;
}): SaveAffordance {
  const dirty =
    opts.placements.length > 0 && sessionTemplateId(opts.loaded, opts.placements) === null;
  return { dirty, canOverwrite: dirty && opts.loaded !== null, canSaveNew: dirty };
}
