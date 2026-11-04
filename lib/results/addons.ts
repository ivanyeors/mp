/** Dynamic accessory add-on suggestions for pillow vs bolster purchase paths. */

import { EAR_PAD } from "@/lib/spatial-fillings/filling-groups";

export const PILLOW_SIZES = ["XS", "S", "M", "L", "XL"] as const;
export type PillowSize = (typeof PILLOW_SIZES)[number];

export const BOLSTER_LENGTHS = ["short", "medium", "long"] as const;
export type BolsterLength = (typeof BOLSTER_LENGTHS)[number];

const PILLOW_SIZE_SET = new Set<string>(PILLOW_SIZES);
const BOLSTER_LENGTH_SET = new Set<string>(BOLSTER_LENGTHS);

export type AddonProductType = "pillow" | "bolster";

export type AddonItemRow = {
  id: number;
  name: string;
  size: string | null;
  subtype?: string | null;
};

export type SuggestedAddon = {
  item_id: number;
  name: string;
  msrp: number;
  currency: string;
  size: string | null;
  /** How well this row matches the suggested size/length (higher wins). */
  matchRank: number;
};

function normSize(size: string | null | undefined): string | null {
  if (size == null) return null;
  const t = String(size).trim();
  if (!t || t === "-") return null;
  return t.toUpperCase();
}

function isOneSize(size: string | null): boolean {
  return size == null;
}

function isExplicitBolsterSize(size: string | null): boolean {
  if (!size) return false;
  const upper = size.toUpperCase();
  if (upper === "BOLSTER") return true;
  return BOLSTER_LENGTH_SET.has(size.toLowerCase() as BolsterLength);
}

function isPillowOnlySize(size: string | null): boolean {
  if (!size) return false;
  // XS/XL never map to bolster lengths.
  return size === "XS" || size === "XL";
}

/**
 * Whether an accessory row is eligible for the product type + suggested size/length.
 * Uses inventory size conventions:
 * - Pillow: exact pillow size (XS–XL) or one-size; never BOLSTER / short|medium|long.
 * - Bolster: BOLSTER or exact length key only (not S/M/L letters — those are pillow sizes
 *   and would leak pillow add-ons like cervical support). Never bare one-size.
 */
export function accessoryFitsProduct(
  row: Pick<AddonItemRow, "size">,
  productType: AddonProductType,
  sizeKey: string | null = null,
): boolean {
  const size = normSize(row.size);
  if (productType === "pillow") {
    if (isExplicitBolsterSize(row.size)) return false;
    if (isOneSize(size)) return true;
    if (!PILLOW_SIZE_SET.has(size!)) return false;
    if (!sizeKey) return true;
    return size === sizeKey.toUpperCase();
  }
  // bolster — explicit bolster tags only
  if (isOneSize(size)) return false;
  if (isPillowOnlySize(size)) return false;
  if (PILLOW_SIZE_SET.has(size!)) return false;

  const length = sizeKey?.toLowerCase() ?? null;
  const raw = String(row.size ?? "").trim().toLowerCase();

  if (size === "BOLSTER") return true;
  if (length && raw === length) return true;
  if (!sizeKey && BOLSTER_LENGTH_SET.has(raw as BolsterLength)) return true;
  return false;
}

/** Rank a row for the suggested size/length (higher = better match). */
export function addonMatchRank(
  row: Pick<AddonItemRow, "size">,
  productType: AddonProductType,
  sizeKey: string | null,
): number {
  const size = normSize(row.size);
  if (productType === "pillow") {
    const want = sizeKey ? sizeKey.toUpperCase() : null;
    if (want && size === want) return 3;
    if (isOneSize(size)) return 1;
    return 2;
  }
  // bolster: prefer exact length, then BOLSTER
  const length = sizeKey?.toLowerCase() ?? null;
  const raw = String(row.size ?? "").trim().toLowerCase();
  if (length && raw === length) return 3;
  if (size === "BOLSTER") return 2;
  return 1;
}

/**
 * An Ear Comfort Pad: an accessory for ear discomfort during side sleep. Matched
 * by name, as a neck support is (`isNeckSupportItem`) — inventory has no
 * category of its own for it. The x-ray's own match, so the two never drift.
 */
export const EAR_COMFORT = EAR_PAD;

/**
 * The add-ons a shopper's answers make relevant. An Ear Comfort Pad is offered
 * only to a shopper who said yes to ear discomfort during side sleep; every
 * other add-on (Cervical Neck Support included) is always offered. Pure.
 */
export function addonsForAnswers<T extends { name: string }>(
  addons: T[],
  answers: { earDiscomfortSideSleep?: string | null },
): T[] {
  if (answers.earDiscomfortSideSleep === "yes") return addons;
  return addons.filter((a) => !EAR_COMFORT.test(a.name));
}

/**
 * A shopper's add-on picks, kept to those still offered. Only a list scoped to
 * the build's size or length can rule a pick out: without one,
 * `suggestAddons` offers an arbitrary size of each sized add-on, so a pick
 * restored after a cancelled payment (Cervical Neck Support M) would be
 * dropped for the L the unscoped list happened to carry. Pure.
 */
export function keepOfferedAddons(
  selected: ReadonlySet<number>,
  offered: { item_id: number }[],
  sizeKey: string | null,
): Set<number> {
  if (!sizeKey) return new Set(selected);
  const valid = new Set(offered.map((a) => a.item_id));
  return new Set([...selected].filter((id) => valid.has(id)));
}

/**
 * Pick one accessory per display name, preferring the best size/length match.
 * Pure — no I/O.
 */
export function suggestAddons(
  rows: AddonItemRow[],
  prices: Map<number, { msrp: number; currency: string }>,
  opts: { productType: AddonProductType; sizeKey?: string | null },
): Array<{ item_id: number; name: string; msrp: number; currency: string }> {
  const sizeKey = opts.sizeKey?.trim() || null;
  const candidates: SuggestedAddon[] = [];

  for (const row of rows) {
    if (!accessoryFitsProduct(row, opts.productType, sizeKey)) continue;
    const priced = prices.get(row.id);
    if (!priced) continue;
    candidates.push({
      item_id: row.id,
      name: row.name,
      msrp: priced.msrp,
      currency: priced.currency,
      size: row.size,
      matchRank: addonMatchRank(row, opts.productType, sizeKey),
    });
  }

  const byName = new Map<string, SuggestedAddon>();
  for (const c of candidates) {
    const key = c.name.trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing || c.matchRank > existing.matchRank) {
      byName.set(key, c);
    }
  }

  return [...byName.values()]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ item_id, name, msrp, currency }) => ({ item_id, name, msrp, currency }));
}
