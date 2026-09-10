/**
 * Staff assist mode (slice 04): pure rules for the size×tier confirm gate,
 * cover/case/add-on eligibility recheck on size change, and the per-cell
 * session-mix edits. No I/O — the assist panel and self-check import these.
 */

import {
  MAX_LAYERS_PER_CELL,
  MAX_PIECES_PER_CELL,
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
