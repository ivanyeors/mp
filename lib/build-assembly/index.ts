/** Final build lines for a Result: composed non-filling + Filling Template + prefs + add-ons. */

import { validateFillingOnlyLines } from "@/lib/filling-templates";

export type BomLineInput = {
  item_id: number;
  quantity: number;
  category: string;
};

export type PreferenceLine = {
  item_id: number;
  quantity: number;
  category: string;
};

export type AddonLine = {
  item_id: number;
  quantity: number;
};

export type BuildLineRole = "composed" | "filling" | "preference" | "addon";

export type BuildLine = {
  item_id: number;
  quantity: number;
  role: BuildLineRole;
  category?: string;
};

const PREFERENCE_CATEGORIES = new Set(["cover", "case"]);

export type AssembleBuildInput = {
  /** Live composed sellable BOM for assigned size×tier / length. */
  composedBomLines: BomLineInput[];
  /** Filling Template lines (must be filling-only). */
  fillingTemplateLines: BomLineInput[];
  /** Customer preferences: cover and case only. */
  preferenceLines: PreferenceLine[];
  addonLines: AddonLine[];
  costByItem: Map<number, number>;
};

export type AssembleBuildResult =
  | { ok: true; lines: BuildLine[]; cogs: number }
  | { ok: false; error: string };

/**
 * Assemble final build lines and COGS.
 * Non-filling (incl. protector) from composed sellable only; fillings from template only.
 * Protector is never accepted as a customer preference.
 */
export function assembleBuild(input: AssembleBuildInput): AssembleBuildResult {
  const fillCheck = validateFillingOnlyLines(input.fillingTemplateLines);
  if (!fillCheck.ok) return fillCheck;

  const badPrefs = input.preferenceLines.filter((l) => !PREFERENCE_CATEGORIES.has(l.category));
  if (badPrefs.length > 0) {
    const ids = badPrefs.map((l) => l.item_id).join(", ");
    return {
      ok: false,
      error: `Customer preferences may only include cover and case (rejected item_id: ${ids})`,
    };
  }

  const lines: BuildLine[] = [];

  // Non-filling composed BOM only — live fillings are ignored when a template is supplied.
  for (const l of input.composedBomLines) {
    if (l.category === "filling") continue;
    lines.push({
      item_id: l.item_id,
      quantity: l.quantity,
      role: "composed",
      category: l.category,
    });
  }

  for (const l of input.fillingTemplateLines) {
    lines.push({
      item_id: l.item_id,
      quantity: l.quantity,
      role: "filling",
      category: "filling",
    });
  }

  for (const l of input.preferenceLines) {
    lines.push({
      item_id: l.item_id,
      quantity: l.quantity,
      role: "preference",
      category: l.category,
    });
  }

  for (const l of input.addonLines) {
    lines.push({ item_id: l.item_id, quantity: l.quantity, role: "addon" });
  }

  let cogs = 0;
  for (const l of lines) {
    cogs += l.quantity * (input.costByItem.get(l.item_id) ?? 0);
  }

  return { ok: true, lines, cogs };
}

export type StockShortage = {
  item_id: number;
  name: string;
  needed: number;
  available: number;
};

/** Pure stock check over assembled build lines. */
export function findStockShortages(
  lines: BuildLine[],
  onHandByItem: Map<number, number>,
  nameByItem: Map<number, string> = new Map(),
): StockShortage[] {
  const needed = new Map<number, number>();
  for (const l of lines) {
    needed.set(l.item_id, (needed.get(l.item_id) ?? 0) + l.quantity);
  }
  const shortages: StockShortage[] = [];
  for (const [itemId, qty] of needed) {
    const available = onHandByItem.get(itemId) ?? 0;
    if (available < qty) {
      shortages.push({
        item_id: itemId,
        name: nameByItem.get(itemId) ?? `Item #${itemId}`,
        needed: qty,
        available,
      });
    }
  }
  return shortages;
}
