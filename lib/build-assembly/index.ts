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

/**
 * The preference role a BOM category fills, or null if it fills none.
 *
 * Inventory splits case categories (`pillow_case` / `bolster_case`) while
 * preference lines use the role names — the same mapping as `toComponentRole()`
 * in `lib/shop/customization-inventory`, deliberately inlined here because that
 * module imports `supabaseAdmin` and this one is pure.
 */
export function preferenceRoleOf(category: string): "cover" | "case" | null {
  if (category === "cover") return "cover";
  if (category === "case" || category === "pillow_case" || category === "bolster_case") {
    return "case";
  }
  return null;
}

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

  // A Customer preference REPLACES the composed BOM's default of the same role.
  // The BOM's cover and case are defaults the shopper is choosing between, not
  // extras on top: CONTEXT.md scopes composed BOM lines to "packaging, protector,
  // and other non-filling defaults". Appending instead of substituting shipped two
  // covers and two cases, deducted both from stock, and charged for the choice on
  // top of a base that already bundled a default.
  const replacedRoles = new Set<"cover" | "case">();
  for (const l of input.preferenceLines) {
    const role = preferenceRoleOf(l.category);
    if (role) replacedRoles.add(role);
  }

  // How many of each role the BOM ships. A preference substitutes AT THE BOM'S
  // QUANTITY: the shopper is choosing a fabric, not how many covers ship. Every
  // premium pillow's BOM carries TWO covers while the configurator posts
  // `quantity: 1`, so honouring the posted number shipped one cover for a
  // two-cover product — and, once preferences displaced the default, charged for
  // one as well.
  const bomQuantityByRole = new Map<"cover" | "case", number>();
  for (const l of input.composedBomLines) {
    if (l.category === "filling") continue;
    const role = preferenceRoleOf(l.category);
    if (role && !bomQuantityByRole.has(role)) bomQuantityByRole.set(role, l.quantity);
  }

  // Non-filling composed BOM only — live fillings are ignored when a template is supplied.
  for (const l of input.composedBomLines) {
    if (l.category === "filling") continue;
    const role = preferenceRoleOf(l.category);
    // Only the roles the shopper actually chose are displaced; a default they did
    // not pick for (no case selected, say) still ships.
    if (role && replacedRoles.has(role)) continue;
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
    const role = preferenceRoleOf(l.category);
    const bomQuantity = role ? bomQuantityByRole.get(role) : undefined;
    lines.push({
      item_id: l.item_id,
      quantity: bomQuantity ?? l.quantity,
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
