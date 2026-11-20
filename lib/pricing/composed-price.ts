import { isEarPadItem } from "@/lib/spatial-fillings/filling-groups";

export type PriceFamily = string;

export const UNKEYED = "";

export type PricedComponent = {
  item_id: number;
  msrp: number | null;
  family?: PriceFamily | null;
  quantity?: number;
};

export type ComposedPriceInput = {
  msrpByFamily: Record<string, number>;
  defaultCover: PricedComponent | null;
  defaultCase: PricedComponent | null;
  caseOptions: PricedComponent[];
  chosenCover: PricedComponent | null;
  chosenCase: PricedComponent | null;
  addonLines: Array<{ msrp: number | null; quantity: number }>;
};

export type ComposedPriceBreakdown = {
  base: number;
  family: PriceFamily | null;
  coverDelta: number;
  caseDelta: number;
  addons: number;
  subtotal: number;
};

export type ComposedPriceResult =
  | ({ ok: true } & ComposedPriceBreakdown)
  | { ok: false; code: "no_price" | "unpriced_component"; error: string };

export function baselineCaseMsrpByFamily(
  caseOptions: PricedComponent[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [family, c] of Object.entries(baselineCaseByFamily(caseOptions))) {
    out[family] = c.msrp!;
  }
  return out;
}

export function baselineCaseByFamily(
  caseOptions: PricedComponent[],
): Record<string, PricedComponent> {
  const out: Record<string, PricedComponent> = {};
  for (const c of caseOptions) {
    if (!c.family || c.msrp == null) continue;
    const seen = out[c.family];
    if (seen == null || c.msrp < seen.msrp! || (c.msrp === seen.msrp && c.item_id < seen.item_id)) {
      out[c.family] = c;
    }
  }
  return out;
}

export function priceComposedBuild(input: ComposedPriceInput): ComposedPriceResult {
  const cover = input.chosenCover ?? input.defaultCover;
  const chosenCase = input.chosenCase ?? input.defaultCase;

  for (const [label, c] of [
    ["cover", cover],
    ["case", chosenCase],
  ] as const) {
    if (c && c.msrp == null) {
      return {
        ok: false,
        code: "unpriced_component",
        error: `Selected ${label} (item ${c.item_id}) has no Costings MSRP`,
      };
    }
  }
  const unpricedAddon = input.addonLines.find((l) => l.msrp == null);
  if (unpricedAddon) {
    return { ok: false, code: "unpriced_component", error: "An add-on has no Costings MSRP" };
  }

  const wantedFamily = chosenCase?.family ?? null;
  const familyBase = wantedFamily == null ? undefined : input.msrpByFamily[wantedFamily];
  const base = familyBase ?? input.msrpByFamily[UNKEYED];
  if (base == null) {
    return {
      ok: false,
      code: "no_price",
      error: wantedFamily
        ? `No Costings MSRP for this size in family "${wantedFamily}", and no unkeyed row`
        : "No Costings MSRP for this size",
    };
  }

  const baseline =
    familyBase != null
      ? (baselineCaseMsrpByFamily(input.caseOptions)[wantedFamily!] ?? null)
      : (input.defaultCase?.msrp ?? null);

  if (chosenCase != null && baseline == null) {
    return {
      ok: false,
      code: "unpriced_component",
      error: wantedFamily
        ? `No priced case in family "${wantedFamily}" to price this size against`
        : `The default case (item ${input.defaultCase?.item_id ?? "?"}) has no Costings MSRP`,
    };
  }
  if (cover != null && input.defaultCover != null && input.defaultCover.msrp == null) {
    return {
      ok: false,
      code: "unpriced_component",
      error: `The default cover (item ${input.defaultCover.item_id}) has no Costings MSRP`,
    };
  }

  const caseQuantity = input.defaultCase?.quantity ?? 1;
  const caseDelta =
    chosenCase == null || baseline == null
      ? 0
      : ((chosenCase.msrp ?? 0) - baseline) * caseQuantity;
  const coverQuantity = input.defaultCover?.quantity ?? 1;
  const coverDelta =
    cover == null || input.defaultCover?.msrp == null
      ? 0
      : ((cover.msrp ?? 0) - input.defaultCover.msrp) * coverQuantity;
  const addons = input.addonLines.reduce((s, l) => s + (l.msrp ?? 0) * l.quantity, 0);

  return {
    ok: true,
    base,
    family: familyBase != null ? wantedFamily : null,
    coverDelta,
    caseDelta,
    addons,
    subtotal: base + coverDelta + caseDelta + addons,
  };
}

const CASE_ROLE_CATEGORIES = new Set(["case", "pillow_case", "bolster_case"]);

export function resolvePreferences(
  preferenceLines: Array<{ item_id: number; category: string }>,
  msrpByItem: Map<number, number>,
  familyByItem: Map<number, string | null>,
): { chosenCover: PricedComponent | null; chosenCase: PricedComponent | null } {
  let chosenCover: PricedComponent | null = null;
  let chosenCase: PricedComponent | null = null;
  for (const l of preferenceLines) {
    if (l.category === "cover") {
      chosenCover = { item_id: l.item_id, msrp: msrpByItem.get(l.item_id) ?? null };
    } else if (CASE_ROLE_CATEGORIES.has(l.category)) {
      chosenCase = {
        item_id: l.item_id,
        msrp: msrpByItem.get(l.item_id) ?? null,
        family: familyByItem.get(l.item_id) ?? null,
      };
    }
  }
  return { chosenCover, chosenCase };
}

export function placedChargeLines(
  pack: ReadonlyArray<{ item_id: number; count: number }>,
  itemById: ReadonlyMap<number, { category?: string | null; name: string }>,
  msrpByItem: ReadonlyMap<number, number>,
): Array<{ msrp: number | null; quantity: number }> {
  return pack.flatMap((l) => {
    const item = itemById.get(l.item_id);
    return item && isEarPadItem(item)
      ? [{ msrp: msrpByItem.get(l.item_id) ?? null, quantity: l.count }]
      : [];
  });
}
