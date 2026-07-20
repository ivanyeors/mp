/**
 * Spatial filling placements (ADR 0008): where each filling piece goes.
 * Pure + browser-safe — no I/O, no node builtins (fingerprinting lives in index.ts).
 */

export type Section = "left" | "center" | "right";
export type SubSection = "front" | "middle" | "back";

/** One Mpillow piece: cell (Section × sub-section) + slot 1–5 + inventory item. */
export type PillowPlacement = {
  section: Section;
  subSection: SubSection;
  slot: number;
  itemId: number;
};

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
};

/** Snake_case API/DB row shape for bolster placements. */
export type BolsterPlacementRow = {
  slot: number;
  item_id: number;
};

export type PackLine = { item_id: number; count: number };

export const MAX_PIECES_PER_CELL = 5;

export const SECTIONS: readonly Section[] = ["left", "center", "right"];
export const SUB_SECTIONS: readonly SubSection[] = ["front", "middle", "back"];

type Validation = { ok: true } | { ok: false; error: string };

/** Map snake_case API/DB rows into lib placements (validate afterwards). */
export function rowsToPillowPlacements(rows: PillowPlacementRow[]): PillowPlacement[] {
  return rows.map((r) => ({
    section: r.section as Section,
    subSection: r.sub_section as SubSection,
    slot: r.slot,
    itemId: r.item_id,
  }));
}

/** Map lib placements back to snake_case API/DB rows (inverse of rowsToPillowPlacements). */
export function pillowPlacementsToRows(placements: PillowPlacement[]): PillowPlacementRow[] {
  return placements.map((p) => ({
    section: p.section,
    sub_section: p.subSection,
    slot: p.slot,
    item_id: p.itemId,
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

function assertFillingItem(
  itemId: number,
  itemCategories: ReadonlyMap<number, string>,
): string | null {
  const category = itemCategories.get(itemId);
  if (category === undefined) return `Unknown item_id: ${itemId}`;
  if (category !== "filling") {
    return `Placements may only use filling items (rejected item_id: ${itemId})`;
  }
  return null;
}

/**
 * Validate cell addresses, slot 1–5, unique (section, subSection, slot), filling items only.
 * The ≤5-per-cell cap follows from the slot range plus slot uniqueness.
 */
export function validatePillowPlacements(
  placements: PillowPlacement[],
  itemCategories: ReadonlyMap<number, string>,
): Validation {
  const seen = new Set<string>();
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
    const slotKey = `${p.section}/${p.subSection}/${p.slot}`;
    if (seen.has(slotKey)) return { ok: false, error: `Duplicate placement at ${slotKey}` };
    seen.add(slotKey);
    const itemError = assertFillingItem(p.itemId, itemCategories);
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
    const itemError = assertFillingItem(p.itemId, itemCategories);
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
