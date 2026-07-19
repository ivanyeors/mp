/**
 * Staff assist mode (slice 04): pure rules for the size×tier confirm gate,
 * cover/case/add-on eligibility recheck on size change, and the per-cell
 * session-mix edits. No I/O — the assist panel and self-check import these.
 */

import {
  MAX_PIECES_PER_CELL,
  placementsExactMatch,
  SECTIONS,
  SUB_SECTIONS,
  type PillowPlacement,
  type Section,
  type SubSection,
} from "@/lib/spatial-fillings";

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

/** Add one piece into the lowest free slot; max 5 per cell with a clear error. */
export function addPiece(
  placements: PillowPlacement[],
  cell: Cell,
  itemId: number,
): { ok: true; placements: PillowPlacement[] } | { ok: false; error: string } {
  const used = new Set(placements.filter((p) => inCell(p, cell)).map((p) => p.slot));
  if (used.size >= MAX_PIECES_PER_CELL) {
    return { ok: false, error: `Max ${MAX_PIECES_PER_CELL} pieces per cell` };
  }
  let slot = 1;
  while (used.has(slot)) slot += 1;
  return {
    ok: true,
    placements: [...placements, { section: cell.section, subSection: cell.subSection, slot, itemId }],
  };
}

/** Remove the piece at (cell, slot). */
export function removePiece(
  placements: PillowPlacement[],
  cell: Cell,
  slot: number,
): PillowPlacement[] {
  return placements.filter((p) => !(inCell(p, cell) && p.slot === slot));
}

// --- Loaded-template tracking (for slice 05's snapshot) ----------------------

export type LoadedTemplate = { id: number; placements: PillowPlacement[] };

/**
 * `sessionFillingTemplateId`: kept only while the session mix still exactly
 * matches the loaded catalog template; any diverging edit clears it.
 */
export function sessionTemplateId(
  loaded: LoadedTemplate | null,
  session: PillowPlacement[],
): number | null {
  if (!loaded) return null;
  return placementsExactMatch(loaded.placements, session) ? loaded.id : null;
}
