/**
 * Spatial filling placements (ADR 0008): where each filling piece goes.
 * Pure + browser-safe — no I/O, no node builtins (fingerprinting lives in index.ts).
 */

import { isNeckSupportItem } from "./filling-groups";

export type Section = "left" | "center" | "right";
export type SubSection = "front" | "middle" | "back";

/**
 * One Mpillow piece: cell (Section × sub-section) + slot + inventory item.
 * `row` is the piece's LAYER within the cell (the view is top-down): 0 = top
 * (front), increasing = deeper into the pillow. Pieces SHARE a layer — several
 * at the same depth lie side by side across the cell — so `row` is no longer
 * distinct per cell. undefined = layer 0, the single-layer default every recipe
 * written before layers carries. Visual only: the pack list ignores it, so it
 * stays out of the fingerprint.
 */
export type PillowPlacement = {
  section: Section;
  subSection: SubSection;
  slot: number;
  itemId: number;
  row?: number;
  /**
   * Insert order (CONTEXT.md): the 1-based step at which this piece goes into
   * its Section when the pillow is assembled; sub-sections and layers ignored.
   * undefined = not authored, which sorts last. Assembly only: out of the pack
   * list and the fingerprint, like `row`.
   */
  insertOrder?: number;
  /**
   * Fine position (X-ray pillow UX slice 08): how far, in mm, the pouch sits
   * from its home in the cell — +x toward the right of the pillow, +y toward
   * the back — in Size M millimetres, like every pouch dimension (the other
   * Sizes scale it, `sizeFactors`). undefined = at home (centred in the free space). Only a pouch
   * smaller than its compartment has anywhere to go; the layout clamps it to
   * the cell. Visual only: out of the pack list and the fingerprint, like `row`.
   */
  offsetXMm?: number;
  offsetYMm?: number;
};

/** A fine offset's bound, mm: the DB check and the validator share it. */
export const MAX_OFFSET_MM = 200;

/** One Mbolster piece: single compartment, slot ≥ 1, no cap in v1. */
export type BolsterPlacement = {
  slot: number;
  itemId: number;
};

/** Snake_case API/DB row shape for pillow placements. */
export type PillowPlacementRow = {
  section: string;
  sub_section: string;
  slot: number;
  item_id: number;
  row_index?: number | null;
  insert_order?: number | null;
  offset_x_mm?: number | null;
  offset_y_mm?: number | null;
};

/** Snake_case API/DB row shape for bolster placements. */
export type BolsterPlacementRow = {
  slot: number;
  item_id: number;
};

export type PackLine = { item_id: number; count: number };

/**
 * Layers: a cell is up to five depth planes, each holding up to five pieces
 * side by side. The slot key is unique per CELL, so the cell cap is the product
 * — the DB `slot between 1 and 25` check and the API bounds both derive from it.
 */
export const MAX_LAYERS_PER_CELL = 5;
export const MAX_PIECES_PER_LAYER = 5;
export const MAX_PIECES_PER_CELL = MAX_LAYERS_PER_CELL * MAX_PIECES_PER_LAYER;

export const SECTIONS: readonly Section[] = ["left", "center", "right"];
export const SUB_SECTIONS: readonly SubSection[] = ["front", "middle", "back"];

/**
 * One cell's pieces grouped into Layers, top→deep (`row`, absent = layer 0),
 * with the numbering COMPACTED so a hole left by a deleted layer never reads
 * as an empty one. The layout and the fit model group with this so they can
 * never disagree about which pieces share a plane. Pieces keep their order.
 */
export function cellLayerGroups(pieces: readonly PillowPlacement[]): PillowPlacement[][] {
  const byLayer = new Map<number, PillowPlacement[]>();
  for (const piece of pieces) {
    const layer = piece.row ?? 0;
    const list = byLayer.get(layer);
    if (list) list.push(piece);
    else byLayer.set(layer, [piece]);
  }
  return [...byLayer.entries()].sort(([a], [b]) => a - b).map(([, list]) => list);
}

type Validation = { ok: true } | { ok: false; error: string };

/** Map snake_case API/DB rows into lib placements (validate afterwards). */
export function rowsToPillowPlacements(rows: PillowPlacementRow[]): PillowPlacement[] {
  return rows.map((r) => ({
    section: r.section as Section,
    subSection: r.sub_section as SubSection,
    slot: r.slot,
    itemId: r.item_id,
    ...(r.row_index == null ? {} : { row: r.row_index }),
    ...(r.insert_order == null ? {} : { insertOrder: r.insert_order }),
    ...(r.offset_x_mm == null || r.offset_x_mm === 0 ? {} : { offsetXMm: r.offset_x_mm }),
    ...(r.offset_y_mm == null || r.offset_y_mm === 0 ? {} : { offsetYMm: r.offset_y_mm }),
  }));
}

/** Map lib placements back to snake_case API/DB rows (inverse of rowsToPillowPlacements). */
export function pillowPlacementsToRows(placements: PillowPlacement[]): PillowPlacementRow[] {
  return placements.map((p) => ({
    section: p.section,
    sub_section: p.subSection,
    slot: p.slot,
    item_id: p.itemId,
    row_index: p.row ?? null,
    insert_order: p.insertOrder ?? null,
    offset_x_mm: p.offsetXMm || null,
    offset_y_mm: p.offsetYMm || null,
  }));
}

/** Map snake_case API/DB rows into lib bolster placements (validate afterwards). */
export function rowsToBolsterPlacements(rows: BolsterPlacementRow[]): BolsterPlacement[] {
  return rows.map((r) => ({ slot: r.slot, itemId: r.item_id }));
}

/** Map lib bolster placements back to snake_case API/DB rows (inverse of rowsToBolsterPlacements). */
export function bolsterPlacementsToRows(placements: BolsterPlacement[]): BolsterPlacementRow[] {
  return placements.map((p) => ({ slot: p.slot, item_id: p.itemId }));
}

/**
 * What an Item is to the validators below: "filling", "neck_support" for a
 * Cervical Neck Support accessory (placeable, and charged), else its category.
 */
export function placementKind(item: { category: string; name: string }): string {
  return isNeckSupportItem(item) ? "neck_support" : item.category;
}

/**
 * A neck support is for premium pillows only: never a bolster, never a basic
 * pillow. `tier` is omitted where it is not known yet (a Filling Template is
 * scoped by size alone), and the Result that uses it re-checks with its tier.
 */
function assertFillingItem(
  itemId: number,
  itemCategories: ReadonlyMap<number, string>,
  neckSupport: { allowed: boolean },
): string | null {
  const kind = itemCategories.get(itemId);
  if (kind === undefined) return `Unknown item_id: ${itemId}`;
  if (kind === "neck_support" && !neckSupport.allowed) {
    return "A Cervical Neck Support is for premium pillows only";
  }
  if (kind !== "filling" && kind !== "neck_support") {
    return `Placements may only use filling items or a neck support (rejected item_id: ${itemId})`;
  }
  return null;
}

/**
 * Validate cell addresses, slot range, unique (section, subSection, slot),
 * layer range, the per-layer piece cap, and placeable items only (`itemCategories`
 * holds placementKind values). The per-cell cap
 * follows from the slot range plus slot uniqueness; the per-layer cap has to be
 * counted, because a layer is a group of slots rather than a slot of its own.
 */
export function validatePillowPlacements(
  placements: PillowPlacement[],
  itemCategories: ReadonlyMap<number, string>,
  opts: { tier?: string | null } = {},
): Validation {
  const neckSupport = { allowed: opts.tier == null || opts.tier === "premium" };
  const seen = new Set<string>();
  const perLayer = new Map<string, number>();
  for (const p of placements) {
    if (!SECTIONS.includes(p.section) || !SUB_SECTIONS.includes(p.subSection)) {
      return { ok: false, error: `Invalid cell address: ${p.section}/${p.subSection}` };
    }
    if (!Number.isInteger(p.slot) || p.slot < 1 || p.slot > MAX_PIECES_PER_CELL) {
      return {
        ok: false,
        error: `Slot must be an integer 1–${MAX_PIECES_PER_CELL}, max ${MAX_PIECES_PER_CELL} pieces per cell (got ${p.slot})`,
      };
    }
    if (p.row !== undefined && (!Number.isInteger(p.row) || p.row < 0 || p.row > MAX_LAYERS_PER_CELL - 1)) {
      return { ok: false, error: `Layer must be an integer 0–${MAX_LAYERS_PER_CELL - 1} (got ${p.row})` };
    }
    if (p.insertOrder !== undefined && (!Number.isInteger(p.insertOrder) || p.insertOrder < 1)) {
      return { ok: false, error: `Insert order must be an integer ≥ 1 (got ${p.insertOrder})` };
    }
    for (const [axis, v] of [["x", p.offsetXMm], ["y", p.offsetYMm]] as const) {
      if (v !== undefined && (!Number.isInteger(v) || Math.abs(v) > MAX_OFFSET_MM)) {
        return { ok: false, error: `Offset ${axis} must be an integer −${MAX_OFFSET_MM}…${MAX_OFFSET_MM} mm (got ${v})` };
      }
    }
    // `row: undefined` and `row: 0` are the same layer — count them together.
    const layerKey = `${p.section}/${p.subSection}/${p.row ?? 0}`;
    const inLayer = (perLayer.get(layerKey) ?? 0) + 1;
    if (inLayer > MAX_PIECES_PER_LAYER) {
      return {
        ok: false,
        error: `Max ${MAX_PIECES_PER_LAYER} pieces per layer (${p.section}/${p.subSection} layer ${(p.row ?? 0) + 1})`,
      };
    }
    perLayer.set(layerKey, inLayer);
    const slotKey = `${p.section}/${p.subSection}/${p.slot}`;
    if (seen.has(slotKey)) return { ok: false, error: `Duplicate placement at ${slotKey}` };
    seen.add(slotKey);
    const itemError = assertFillingItem(p.itemId, itemCategories, neckSupport);
    if (itemError) return { ok: false, error: itemError };
  }
  return { ok: true };
}

/** Validate slot ≥ 1, unique slots, filling items only. No piece cap for Mbolster in v1. */
export function validateBolsterPlacements(
  placements: BolsterPlacement[],
  itemCategories: ReadonlyMap<number, string>,
): Validation {
  const seen = new Set<number>();
  for (const p of placements) {
    if (!Number.isInteger(p.slot) || p.slot < 1) {
      return { ok: false, error: `Slot must be a positive integer (got ${p.slot})` };
    }
    if (seen.has(p.slot)) return { ok: false, error: `Duplicate slot ${p.slot}` };
    seen.add(p.slot);
    const itemError = assertFillingItem(p.itemId, itemCategories, { allowed: false });
    if (itemError) return { ok: false, error: itemError };
  }
  return { ok: true };
}

function tally(entries: Array<[number, number]>): PackLine[] {
  const counts = new Map<number, number>();
  for (const [itemId, n] of entries) counts.set(itemId, (counts.get(itemId) ?? 0) + n);
  return Array.from(counts.entries())
    .map(([item_id, count]) => ({ item_id, count }))
    .sort((a, b) => a.item_id - b.item_id);
}

/** Flatten placements to the derived pack list (item_id × count), sorted by item_id. */
export function flattenToPackList(placements: Array<{ itemId: number }>): PackLine[] {
  return tally(placements.map((p) => [p.itemId, 1]));
}

/** Pack list for a template: placements are the truth when present, else legacy flat lines. */
export function derivePackList(
  placementRows: Array<{ item_id: number }>,
  lines: Array<{ item_id: number; quantity: number }>,
): PackLine[] {
  if (placementRows.length > 0) return tally(placementRows.map((r) => [r.item_id, 1]));
  return tally(lines.map((l) => [l.item_id, Number(l.quantity)]));
}

export type AnyPlacement = PillowPlacement | BolsterPlacement;

/** Internal canonical form: cells sorted, item ids within each cell sorted — slot numbering dropped. */
export function canonicalizePlacements(placements: AnyPlacement[]): Array<[string, number[]]> {
  const cells = new Map<string, number[]>();
  for (const p of placements) {
    const key = "section" in p ? `${p.section}/${p.subSection}` : "compartment";
    const ids = cells.get(key) ?? [];
    ids.push(p.itemId);
    cells.set(key, ids);
  }
  return Array.from(cells.entries())
    .map(([key, ids]): [string, number[]] => [key, [...ids].sort((a, b) => a - b)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** True iff both hold the same multiset of items per cell (slot numbering/order ignored). */
export function placementsExactMatch(a: AnyPlacement[], b: AnyPlacement[]): boolean {
  return JSON.stringify(canonicalizePlacements(a)) === JSON.stringify(canonicalizePlacements(b));
}
