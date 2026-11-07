/**
 * Staff assist mode autosave: what Staff built on a preview — the size×tier
 * they chose for an Mpillow, and the mix on the x-ray of either product — kept
 * on this device so leaving the page does not put the engine's recommendation
 * back. A Paired build's Mbolster step, a reload and a cancelled Checkout all
 * unmount the preview, and the page that comes back re-asks the engine.
 *
 * Stored in the snake_case row shape the API and the hold already use. Pure —
 * the configurators own the storage it rides in (the Mpillow's hold-cancel
 * draft, the Paired build hand-off).
 */

import {
  PILLOW_SIZES,
  PILLOW_TIERS,
  type LoadedTemplate,
  type SizeTier,
} from "@/lib/configurator/staff-assist";
import {
  bolsterPlacementsToRows,
  pillowPlacementsToRows,
  rowsToBolsterPlacements,
  rowsToPillowPlacements,
  SECTIONS,
  SUB_SECTIONS,
  type BolsterPlacement,
  type BolsterPlacementRow,
  type PillowPlacement,
  type PillowPlacementRow,
} from "@/lib/spatial-fillings/core";

/** An Mpillow's Staff session: the size×tier on screen and the mix built for it. */
export type PillowAssistDraft = {
  size: SizeTier["size"];
  tier: SizeTier["tier"];
  placements: PillowPlacementRow[];
  /** The catalog template the mix came from, so its "Matches template" claim survives too. */
  loadedTemplate: { id: number; placements: PillowPlacementRow[] } | null;
};

/** An Mbolster's Staff session. Its length is the engine's, so it only scopes the mix. */
export type BolsterAssistDraft = {
  /** The length the mix was built for: a different recommended length starts over. */
  length: string;
  placements: BolsterPlacementRow[];
  loadedTemplate: { id: number; placements: BolsterPlacementRow[] } | null;
};

// --- Writing --------------------------------------------------------------------

/** The size×tier a preview shows, or null while it shows none (or one Staff cannot pick). */
export function asSizeTier(size: string | null | undefined, tier: string | null | undefined): SizeTier | null {
  if (!(PILLOW_SIZES as readonly unknown[]).includes(size)) return null;
  if (!(PILLOW_TIERS as readonly unknown[]).includes(tier)) return null;
  return { size: size as SizeTier["size"], tier: tier as SizeTier["tier"] };
}

export function pillowAssistDraft(
  sizeTier: SizeTier,
  placements: PillowPlacement[],
  loaded: LoadedTemplate | null,
): PillowAssistDraft {
  return {
    size: sizeTier.size,
    tier: sizeTier.tier,
    placements: pillowPlacementsToRows(placements),
    loadedTemplate: loaded
      ? { id: loaded.id, placements: pillowPlacementsToRows(loaded.placements as PillowPlacement[]) }
      : null,
  };
}

export function bolsterAssistDraft(
  length: string,
  placements: BolsterPlacement[],
  loaded: LoadedTemplate | null,
): BolsterAssistDraft {
  return {
    length,
    placements: bolsterPlacementsToRows(placements),
    loadedTemplate: loaded
      ? { id: loaded.id, placements: bolsterPlacementsToRows(loaded.placements as BolsterPlacement[]) }
      : null,
  };
}

// --- Reading --------------------------------------------------------------------

export function restorePillowAssist(draft: PillowAssistDraft): {
  sizeTier: SizeTier;
  placements: PillowPlacement[];
  loadedTemplate: LoadedTemplate | null;
} {
  return {
    sizeTier: { size: draft.size, tier: draft.tier },
    placements: rowsToPillowPlacements(draft.placements),
    loadedTemplate: draft.loadedTemplate
      ? { id: draft.loadedTemplate.id, placements: rowsToPillowPlacements(draft.loadedTemplate.placements) }
      : null,
  };
}

/** The bolster session to restore, or null when it was built for another length. */
export function restoreBolsterAssist(
  draft: BolsterAssistDraft | null | undefined,
  length: string,
): { placements: BolsterPlacement[]; loadedTemplate: LoadedTemplate | null } | null {
  if (!draft || draft.length !== length) return null;
  return {
    placements: rowsToBolsterPlacements(draft.placements),
    loadedTemplate: draft.loadedTemplate
      ? { id: draft.loadedTemplate.id, placements: rowsToBolsterPlacements(draft.loadedTemplate.placements) }
      : null,
  };
}

// --- Parsing (device storage is read back untrusted) --------------------------------

const isObject = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object";
const isPositiveInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;
const isOptionalInt = (v: unknown, min: number) => v == null || (Number.isInteger(v) && (v as number) >= min);
const isOptionalNumber = (v: unknown) => v == null || (typeof v === "number" && Number.isFinite(v));

function isPillowRow(v: unknown): v is PillowPlacementRow {
  if (!isObject(v)) return false;
  return (
    (SECTIONS as readonly unknown[]).includes(v.section) &&
    (SUB_SECTIONS as readonly unknown[]).includes(v.sub_section) &&
    isPositiveInt(v.slot) &&
    isPositiveInt(v.item_id) &&
    isOptionalInt(v.row_index, 0) &&
    isOptionalInt(v.insert_order, 1) &&
    isOptionalNumber(v.offset_x_mm) &&
    isOptionalNumber(v.offset_y_mm)
  );
}

function isBolsterRow(v: unknown): v is BolsterPlacementRow {
  return isObject(v) && isPositiveInt(v.slot) && isPositiveInt(v.item_id);
}

function parseRows<T>(raw: unknown, isRow: (v: unknown) => v is T): T[] | null {
  return Array.isArray(raw) && raw.every(isRow) ? raw : null;
}

function parseLoaded<T>(
  raw: unknown,
  isRow: (v: unknown) => v is T,
): { id: number; placements: T[] } | null | undefined {
  if (raw === null) return null;
  if (!isObject(raw) || !isPositiveInt(raw.id)) return undefined;
  const placements = parseRows(raw.placements, isRow);
  return placements ? { id: raw.id, placements } : undefined;
}

/** A stored Mpillow session, or null when anything in it is not what this module wrote. */
export function parsePillowAssistDraft(raw: unknown): PillowAssistDraft | null {
  if (!isObject(raw)) return null;
  const sizeTier = asSizeTier(raw.size as string, raw.tier as string);
  const placements = parseRows(raw.placements, isPillowRow);
  const loadedTemplate = parseLoaded(raw.loadedTemplate, isPillowRow);
  if (!sizeTier || !placements || loadedTemplate === undefined) return null;
  return { ...sizeTier, placements, loadedTemplate };
}

/** A stored Mbolster session, or null when anything in it is not what this module wrote. */
export function parseBolsterAssistDraft(raw: unknown): BolsterAssistDraft | null {
  if (!isObject(raw)) return null;
  if (typeof raw.length !== "string" || !raw.length) return null;
  const placements = parseRows(raw.placements, isBolsterRow);
  const loadedTemplate = parseLoaded(raw.loadedTemplate, isBolsterRow);
  if (!placements || loadedTemplate === undefined) return null;
  return { length: raw.length, placements, loadedTemplate };
}
