import { isEarPadItem, isNeckSupportItem } from "./filling-groups";

export type Section = "left" | "center" | "right";
export type SubSection = "front" | "middle" | "back";

export type PillowPlacement = {
  section: Section;
  subSection: SubSection;
  slot: number;
  itemId: number;
  row?: number;
  insertOrder?: number;
  offsetXMm?: number;
  offsetYMm?: number;
};

export const MAX_OFFSET_MM = 200;

export type BolsterPlacement = {
  slot: number;
  itemId: number;
};

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

export type BolsterPlacementRow = {
  slot: number;
  item_id: number;
};

export type PackLine = { item_id: number; count: number };

export const MAX_LAYERS_PER_CELL = 5;
export const MAX_PIECES_PER_LAYER = 5;
export const MAX_PIECES_PER_CELL = MAX_LAYERS_PER_CELL * MAX_PIECES_PER_LAYER;

export const SECTIONS: readonly Section[] = ["left", "center", "right"];
export const SUB_SECTIONS: readonly SubSection[] = ["front", "middle", "back"];

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

export function rowsToBolsterPlacements(rows: BolsterPlacementRow[]): BolsterPlacement[] {
  return rows.map((r) => ({ slot: r.slot, itemId: r.item_id }));
}

export function bolsterPlacementsToRows(placements: BolsterPlacement[]): BolsterPlacementRow[] {
  return placements.map((p) => ({ slot: p.slot, item_id: p.itemId }));
}

export function placementKind(item: { category: string; name: string }): string {
  if (isNeckSupportItem(item)) return "neck_support";
  if (isEarPadItem(item)) return "ear_pad";
  return item.category;
}

const ACCESSORY_NAME: Readonly<Record<string, string>> = {
  neck_support: "A Cervical Neck Support",
  ear_pad: "An Ear Comfort Pad",
};

function assertFillingItem(
  itemId: number,
  itemCategories: ReadonlyMap<number, string>,
  accessory: { allowed: boolean },
): string | null {
  const kind = itemCategories.get(itemId);
  if (kind === undefined) return `Unknown item_id: ${itemId}`;
  const name = ACCESSORY_NAME[kind];
  if (name && !accessory.allowed) return `${name} is for premium pillows only`;
  if (kind !== "filling" && !name) {
    return `Placements may only use filling items, a neck support or an ear pad (rejected item_id: ${itemId})`;
  }
  return null;
}

export function validatePillowPlacements(
  placements: PillowPlacement[],
  itemCategories: ReadonlyMap<number, string>,
  opts: { tier?: string | null } = {},
): Validation {
  const accessory = { allowed: opts.tier == null || opts.tier === "premium" };
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
    const itemError = assertFillingItem(p.itemId, itemCategories, accessory);
    if (itemError) return { ok: false, error: itemError };
  }
  return { ok: true };
}

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

export function flattenToPackList(placements: Array<{ itemId: number }>): PackLine[] {
  return tally(placements.map((p) => [p.itemId, 1]));
}

export function derivePackList(
  placementRows: Array<{ item_id: number }>,
  lines: Array<{ item_id: number; quantity: number }>,
): PackLine[] {
  if (placementRows.length > 0) return tally(placementRows.map((r) => [r.item_id, 1]));
  return tally(lines.map((l) => [l.item_id, Number(l.quantity)]));
}

export type AnyPlacement = PillowPlacement | BolsterPlacement;

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

export function placementsExactMatch(a: AnyPlacement[], b: AnyPlacement[]): boolean {
  return JSON.stringify(canonicalizePlacements(a)) === JSON.stringify(canonicalizePlacements(b));
}
