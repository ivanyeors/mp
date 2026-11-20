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

export function preferenceRoleOf(category: string): "cover" | "case" | null {
  if (category === "cover") return "cover";
  if (category === "case" || category === "pillow_case" || category === "bolster_case") {
    return "case";
  }
  return null;
}

const INSIDE_THE_PILLOW: ReadonlySet<string> = new Set(["filling", "neck_support", "ear_pad"]);

export type AssembleBuildInput = {
  composedBomLines: BomLineInput[];
  fillingTemplateLines: BomLineInput[];
  preferenceLines: PreferenceLine[];
  addonLines: AddonLine[];
  costByItem: Map<number, number>;
};

export type AssembleBuildResult =
  | { ok: true; lines: BuildLine[]; cogs: number }
  | { ok: false; error: string };

export function assembleBuild(input: AssembleBuildInput): AssembleBuildResult {
  const badFills = input.fillingTemplateLines.filter((l) => !INSIDE_THE_PILLOW.has(l.category));
  if (badFills.length > 0) {
    const ids = badFills.map((l) => l.item_id).join(", ");
    return {
      ok: false,
      error: `Fillings may only be filling items, a neck support or an ear pad (rejected item_id: ${ids})`,
    };
  }

  const badPrefs = input.preferenceLines.filter((l) => !PREFERENCE_CATEGORIES.has(l.category));
  if (badPrefs.length > 0) {
    const ids = badPrefs.map((l) => l.item_id).join(", ");
    return {
      ok: false,
      error: `Customer preferences may only include cover and case (rejected item_id: ${ids})`,
    };
  }

  const lines: BuildLine[] = [];

  const replacedRoles = new Set<"cover" | "case">();
  for (const l of input.preferenceLines) {
    const role = preferenceRoleOf(l.category);
    if (role) replacedRoles.add(role);
  }

  const bomQuantityByRole = new Map<"cover" | "case", number>();
  for (const l of input.composedBomLines) {
    if (l.category === "filling") continue;
    const role = preferenceRoleOf(l.category);
    if (role && !bomQuantityByRole.has(role)) bomQuantityByRole.set(role, l.quantity);
  }

  for (const l of input.composedBomLines) {
    if (l.category === "filling") continue;
    const role = preferenceRoleOf(l.category);
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
