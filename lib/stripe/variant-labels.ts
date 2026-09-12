/**
 * Human labels for Stripe Prices, derived from the same Costings data the amount
 * comes from.
 *
 * A premium pillow's five Stripe Prices differ by SIZE, but the amount also depends
 * on the case FABRIC its BOM ships — premium XS is 360 because it ships Fibrecool
 * while S is 400 because it ships linen. Read in the Stripe dashboard, "Size XS —
 * 360.00" next to "Size S — 400.00" looks arbitrary, and the fabric is the missing
 * half of the explanation.
 *
 * Nothing here decides a price. It only says, in words, what the price already is —
 * so the label cannot drift from the amount: both are read from the BOM in the same
 * pass.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const CASE_CATEGORIES = ["case", "pillow_case", "bolster_case"] as const;

export type VariantLabel = {
  /** Stripe Price `nickname` — what the dashboard's price list shows. */
  nickname: string;
  /** Stripe Price `metadata`, for anyone reconciling a charge back to a build. */
  metadata: Record<string, string>;
  /** One line for the Product description's derived block. */
  line: string;
  /** Position in the canonical size run, for ordering that block. */
  sortKey: number;
  /**
   * True only when the line was DERIVED from a pillow's BOM — a real size and the
   * fabric it ships. False for a single-variant accessory, whose "line" is just its
   * own name and tells a reader nothing they cannot see on the price.
   */
  derived: boolean;
};

type VariantLike = {
  id: string;
  title?: string | null;
  sku?: string | null;
  price: number;
  currency: string;
  pillow_product_id?: number | null;
};

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Sorting the lines as strings gave L, M, S, XL, XS — alphabetical, not a size run. */
const SIZE_ORDER = ["XS", "S", "M", "L", "XL"];
function sizeRank(size: string): number {
  const i = SIZE_ORDER.indexOf(size.toUpperCase());
  return i === -1 ? SIZE_ORDER.length : i;
}

/**
 * Labels for a product's variants, keyed by variant id.
 *
 * Pillow variants get size + the fabric their BOM ships; everything else falls back
 * to the variant's own title, which is already what the Price metadata carried.
 */
export async function loadVariantLabels(
  admin: SupabaseClient,
  variants: VariantLike[],
): Promise<Map<string, VariantLabel>> {
  const out = new Map<string, VariantLabel>();

  const pillowIds = [
    ...new Set(
      variants
        .map((v) => v.pillow_product_id)
        .filter((id): id is number => typeof id === "number"),
    ),
  ];

  type PillowFacts = { size: string; tier: string; caseName: string | null; family: string | null };
  const pillowById = new Map<number, PillowFacts>();

  if (pillowIds.length > 0) {
    const [{ data: products }, { data: bom }] = await Promise.all([
      admin.from("pillow_products").select("id, size, kind").in("id", pillowIds),
      admin.from("bom_lines").select("product_id, item_id").in("product_id", pillowIds),
    ]);

    const itemIds = [...new Set((bom ?? []).map((b) => Number(b.item_id)))];
    const { data: items } = itemIds.length
      ? await admin
          .from("items")
          .select("id, name, category, price_family")
          .in("id", itemIds)
          .in("category", CASE_CATEGORIES as unknown as string[])
      : { data: [] as Array<{ id: number; name: string; category: string; price_family: string | null }> };

    const caseById = new Map(
      (items ?? []).map((i) => [
        Number(i.id),
        { name: String(i.name), family: (i.price_family as string | null) ?? null },
      ]),
    );

    // Lowest item id wins so the label is stable across runs — `bom_lines` comes
    // back unordered, the same reason the price resolution sorts.
    const caseByPillow = new Map<number, { name: string; family: string | null }>();
    for (const b of [...(bom ?? [])].sort((x, y) => Number(x.item_id) - Number(y.item_id))) {
      const found = caseById.get(Number(b.item_id));
      if (found && !caseByPillow.has(Number(b.product_id))) {
        caseByPillow.set(Number(b.product_id), found);
      }
    }

    for (const p of products ?? []) {
      const c = caseByPillow.get(Number(p.id));
      pillowById.set(Number(p.id), {
        size: String(p.size),
        tier: String(p.kind ?? "basic"),
        caseName: c?.name ?? null,
        family: c?.family ?? null,
      });
    }
  }

  for (const v of variants) {
    const fallback = v.title || v.sku || "Default";
    const facts = v.pillow_product_id != null ? pillowById.get(v.pillow_product_id) : undefined;

    if (!facts) {
      out.set(v.id, {
        nickname: fallback,
        metadata: { supabase_variant_id: v.id, variant_title: fallback },
        line: `${fallback} — ${v.currency.toUpperCase()} ${v.price.toFixed(2)}`,
        sortKey: SIZE_ORDER.length,
        derived: false,
      });
      continue;
    }

    const fabric = facts.family ? titleCase(facts.family) : null;
    // The fabric half is omitted rather than guessed when a case carries no family:
    // an unfamilied case cannot be priced either, so a confident label would be a
    // claim the pricing side refuses to make.
    const nickname = fabric
      ? `${titleCase(facts.tier)} ${facts.size} · ${fabric} case`
      : `${titleCase(facts.tier)} ${facts.size}`;

    const metadata: Record<string, string> = {
      supabase_variant_id: v.id,
      variant_title: fallback,
      size: facts.size,
      tier: facts.tier,
      includes: "pillow + cover + case",
    };
    if (fabric) metadata.case_fabric = facts.family!;
    if (facts.caseName) metadata.case_item = facts.caseName;

    const caseNote = facts.caseName
      ? `${fabric ?? "case"} (${facts.caseName})`
      : (fabric ?? "case");
    out.set(v.id, {
      nickname,
      metadata,
      line: `${facts.size} — ${caseNote} — ${v.currency.toUpperCase()} ${v.price.toFixed(2)}`,
      sortKey: sizeRank(facts.size),
      derived: true,
    });
  }

  return out;
}

/** Fences the generated block so a re-sync replaces it instead of stacking copies. */
const BLOCK_START = "— Prices —";

/**
 * Admin description with a derived pricing block appended.
 *
 * The admin's own text is preserved: the block is fenced and any previous copy is
 * stripped first, so this is idempotent and never eats hand-written copy. A stale
 * block is stripped even when no new one is added, so turning this off for a product
 * cleans up after itself.
 *
 * Only DERIVED lines qualify. A single-variant accessory would otherwise get
 * "Slope Mattress — 120.00" under a sentence about covers and cases it does not
 * have — noise, and false.
 */
export function withPricingBlock(description: string, labels: VariantLabel[]): string {
  const base = description.split(BLOCK_START)[0].trimEnd();
  const lines = [...labels]
    .filter((l) => l.derived)
    .sort((a, b) => a.sortKey - b.sortKey || a.line.localeCompare(b.line))
    .map((l) => l.line);
  if (lines.length === 0) return base;
  const block = [
    BLOCK_START,
    "Each price covers that size with the cover and case its build ships.",
    ...lines,
  ].join("\n");
  return base ? `${base}\n\n${block}` : block;
}
