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

export const PILLOW_CELLS: readonly Cell[] = SECTIONS.flatMap((section) =>
  SUB_SECTIONS.map((subSection) => ({ section, subSection })),
);

export type ConfirmGateState = { pending: SizeTier | null };
export type ConfirmGateEvent =
  | { type: "request"; current: SizeTier; next: SizeTier }
  | { type: "cancel" }
  | { type: "confirm" };

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

export type OfferedOption = { item_id: number; stock_available: number };
export type SelectedItem = { itemId: number; name: string };

export type SizeRecheckInput = {
  cover: SelectedItem | null;
  caseSel: SelectedItem | null;
  addons: SelectedItem[];
  offeredCovers: ReadonlyArray<OfferedOption>;
  offeredCases: ReadonlyArray<OfferedOption>;
  offeredAddonIds: ReadonlyArray<number>;
};

export type SizeRecheckResult = {
  coverId: number | null;
  caseId: number | null;
  addonIds: number[];
  clearedNames: string[];
  keptOutOfStockNames: string[];
};

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

export type TemplateSuggestion = { size: string; templateId: number };

export function templateSuggestion(
  record: { size: string | null; templateId: string | null } | null,
): TemplateSuggestion | null {
  const id = Number(record?.templateId);
  if (!record?.size || !Number.isInteger(id) || id <= 0) return null;
  return { size: String(record.size), templateId: id };
}

export function startingTemplateId(
  size: string,
  suggestion: TemplateSuggestion | null,
  defaultTemplateId: number | null,
): number | null {
  return suggestion?.size === size ? suggestion.templateId : defaultTemplateId;
}

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

export function soldPillowTier(opts: {
  staffTier: string | null | undefined;
  premiumFlow: boolean;
}): PillowTier {
  const { staffTier } = opts;
  if (staffTier === "basic" || staffTier === "premium") return staffTier;
  return opts.premiumFlow ? "premium" : "basic";
}

function inCell(p: PillowPlacement, cell: Cell): boolean {
  return p.section === cell.section && p.subSection === cell.subSection;
}

export function cellPieces(placements: PillowPlacement[], cell: Cell): PillowPlacement[] {
  return placements.filter((p) => inCell(p, cell)).sort((a, b) => a.slot - b.slot);
}

export const layerOf = (p: PillowPlacement) => p.row ?? 0;

function withoutRow(p: PillowPlacement): PillowPlacement {
  const { row: _dropped, ...rest } = p;
  return rest;
}

export function cellLayers(placements: PillowPlacement[], cell: Cell): PillowPlacement[][] {
  const byRow = new Map<number, PillowPlacement[]>();
  for (const p of cellPieces(placements, cell)) {
    const list = byRow.get(layerOf(p));
    if (list) list.push(p);
    else byRow.set(layerOf(p), [p]);
  }
  return [...byRow.entries()].sort(([a], [b]) => a - b).map(([, list]) => list);
}

function compactLayers(placements: PillowPlacement[], cell: Cell): PillowPlacement[] {
  const layers = cellLayers(placements, cell);
  if (layers.length <= 1) return placements.map((p) => (inCell(p, cell) ? withoutRow(p) : p));
  return applyLayerOrder(placements, cell, layers);
}

function applyLayerOrder(
  placements: PillowPlacement[],
  cell: Cell,
  order: PillowPlacement[][],
): PillowPlacement[] {
  const rowBySlot = new Map<number, number>();
  order.forEach((layer, depth) => layer.forEach((p) => rowBySlot.set(p.slot, depth)));
  return placements.map((p) => (inCell(p, cell) ? { ...p, row: rowBySlot.get(p.slot) ?? 0 } : p));
}

export function addPiece(
  placements: PillowPlacement[],
  cell: Cell,
  itemId: number,
  layer: number | null = null,
): { ok: true; placements: PillowPlacement[] } | { ok: false; error: string } {
  const layers = cellLayers(placements, cell);
  const target =
    layer ?? Math.min(layers.findIndex((l) => l.length < MAX_PIECES_PER_LAYER), layers.length);
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

export function removePiece(
  placements: PillowPlacement[],
  cell: Cell,
  slot: number,
): PillowPlacement[] {
  return compactLayers(placements.filter((p) => !(inCell(p, cell) && p.slot === slot)), cell);
}

export function removeLayer(
  placements: PillowPlacement[],
  cell: Cell,
  layer: number,
): PillowPlacement[] {
  const doomed = new Set((cellLayers(placements, cell)[layer] ?? []).map((p) => p.slot));
  if (doomed.size === 0) return placements;
  return compactLayers(placements.filter((p) => !(inCell(p, cell) && doomed.has(p.slot))), cell);
}

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

export type PieceRef = Cell & { slot: number };

export type MoveTarget = { cell: Cell; layer?: number | null; index?: number };

export type MoveResult =
  | { ok: true; placements: PillowPlacement[]; ref: PieceRef }
  | { ok: false; error: string };

const sameCell = (a: Cell, b: Cell) => a.section === b.section && a.subSection === b.subSection;

function freeSlot(placements: PillowPlacement[], cell: Cell): number {
  const used = new Set(placements.filter((p) => inCell(p, cell)).map((p) => p.slot));
  let slot = 1;
  while (used.has(slot)) slot += 1;
  return slot;
}

function writeLayerOrder(placements: PillowPlacement[], cell: Cell, order: PillowPlacement[]): PillowPlacement[] {
  const slots = order.map((p) => p.slot).sort((a, b) => a - b);
  const slotFor = new Map(order.map((p, i) => [p.slot, slots[i]]));
  return placements.map((p) => (inCell(p, cell) && slotFor.has(p.slot) ? { ...p, slot: slotFor.get(p.slot)! } : p));
}

export function movePiece(
  placements: PillowPlacement[],
  ref: PieceRef,
  to: MoveTarget,
): MoveResult {
  const moving = placements.find((p) => inCell(p, ref) && p.slot === ref.slot);
  if (!moving) return { ok: false, error: `No piece at ${ref.section} ${ref.subSection} slot ${ref.slot}` };
  const staying = sameCell(ref, to.cell);
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
    const layer = cellLayers(next, to.cell).find((l) => l.some((p) => p.slot === slot)) ?? [];
    const others = layer.filter((p) => p.slot !== slot);
    const index = Math.max(0, Math.min(to.index, others.length));
    const slots = layer.map((p) => p.slot).sort((a, b) => a - b);
    next = writeLayerOrder(next, to.cell, [...others.slice(0, index), layer.find((p) => p.slot === slot)!, ...others.slice(index)]);
    return { ok: true, placements: next, ref: { section: to.cell.section, subSection: to.cell.subSection, slot: slots[index] ?? slot } };
  }
  return { ok: true, placements: next, ref: { section: to.cell.section, subSection: to.cell.subSection, slot } };
}

export function shiftPieceLayer(placements: PillowPlacement[], ref: PieceRef, dir: 1 | -1): MoveResult {
  const moving = placements.find((p) => inCell(p, ref) && p.slot === ref.slot);
  if (!moving) return { ok: false, error: `No piece at ${ref.section} ${ref.subSection} slot ${ref.slot}` };
  const depth = layerOf(moving);
  const layers = cellLayers(placements, ref);
  const alone = (layers[depth]?.length ?? 0) === 1;
  const target = depth + dir;
  if (target < 0 || (dir === 1 && alone && depth === layers.length - 1)) return { ok: true, placements, ref };
  const landing = dir === 1 && alone ? target - 1 : target;
  return movePiece(placements, ref, { cell: ref, layer: landing });
}

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

export function reorderedRef(placements: PillowPlacement[], ref: PieceRef, dir: 1 | -1): PieceRef {
  const layer = cellLayers(placements, ref).find((l) => l.some((p) => p.slot === ref.slot));
  if (!layer) return ref;
  const j = layer.findIndex((p) => p.slot === ref.slot) + dir;
  if (j < 0 || j >= layer.length) return ref;
  return { ...ref, slot: layer[j].slot };
}

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

export type CellArrangement = "side" | "stacked";

export function cellArrangement(placements: PillowPlacement[], cell: Cell): CellArrangement {
  return cellLayers(placements, cell).length > 1 ? "stacked" : "side";
}

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

export function cellStack(placements: PillowPlacement[], cell: Cell): PillowPlacement[] {
  return cellLayers(placements, cell).flat();
}

export function mirrorTarget(from: Section): Section | null {
  return from === "left" ? "right" : from === "right" ? "left" : null;
}

export function mirrorSection(placements: PillowPlacement[], from: Section): PillowPlacement[] {
  const to = mirrorTarget(from);
  if (to === null) return placements;
  const source = placements.filter((p) => p.section === from);
  if (source.length === 0) return placements;
  return [
    ...placements.filter((p) => p.section !== to),
    ...source.map((p) => (p.offsetXMm ? { ...p, section: to, offsetXMm: -p.offsetXMm } : { ...p, section: to })),
  ];
}

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

export function addBolsterPiece(
  placements: BolsterPlacement[],
  itemId: number,
): BolsterPlacement[] {
  const used = new Set(placements.map((p) => p.slot));
  let slot = 1;
  while (used.has(slot)) slot += 1;
  return [...placements, { slot, itemId }];
}

export function removeBolsterPiece(
  placements: BolsterPlacement[],
  slot: number,
): BolsterPlacement[] {
  return placements.filter((p) => p.slot !== slot);
}

export function removeFilling<T extends AnyPlacement>(placements: T[], itemId: number): T[] {
  let next = placements.filter((p) => p.itemId !== itemId);
  for (const p of placements) {
    if (p.itemId === itemId && "section" in p) {
      next = compactLayers(next as PillowPlacement[], p) as T[];
    }
  }
  return next;
}

export type LoadedTemplate = { id: number; placements: AnyPlacement[] };

export function sessionTemplateId(
  loaded: LoadedTemplate | null,
  session: AnyPlacement[],
): number | null {
  if (!loaded) return null;
  return placementsExactMatch(loaded.placements, session) ? loaded.id : null;
}

export type SaveAffordance = {
  dirty: boolean;
  canOverwrite: boolean;
  canSaveNew: boolean;
};

export function saveAffordance(opts: {
  placements: AnyPlacement[];
  loaded: LoadedTemplate | null;
}): SaveAffordance {
  const dirty =
    opts.placements.length > 0 && sessionTemplateId(opts.loaded, opts.placements) === null;
  return { dirty, canOverwrite: dirty && opts.loaded !== null, canSaveNew: dirty };
}
