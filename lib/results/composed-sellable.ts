/** Composed sellable BOM + Costings MSRP for pillow (size×tier) or bolster (length). */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  validateDefaultFillingTemplate,
  type FillingTemplateLike,
} from "@/lib/filling-templates";
import { loadTemplateKeys } from "@/lib/filling-templates/membership";
import {
  UNKEYED,
  priceComposedBuild,
  type PricedComponent,
} from "@/lib/pricing/composed-price";

export const BOLSTER_LENGTHS = ["short", "medium", "long"] as const;
export type BolsterLength = (typeof BOLSTER_LENGTHS)[number];

export type ComposedSellableKey =
  | { productType: "pillow"; size: string; tier: string }
  | { productType: "bolster"; length: BolsterLength };

export type ComposedBomLine = {
  item_id: number;
  quantity: number;
  category: string;
};

export type ComposedSellable = {
  bomLines: ComposedBomLine[];
  /**
   * Costings MSRP of the DEFAULT build — the shelf price, what the shop shows.
   * `null` when the default build cannot be priced; `priceFault` says why. NOT an
   * error: `assign-prep` and the admin assign screen want only `bomLines`, and one
   * unpriced BOM cover used to take both down.
   */
  msrp: number | null;
  priceFault: { code: "no_price" | "unpriced_component"; error: string } | null;
  /** Costings MSRPs by `product_prices.variant`; `UNKEYED` holds a single unkeyed row. */
  msrpByFamily: Record<string, number>;
  /** Cover and case the composed BOM ships by default, priced. */
  defaultCover: PricedComponent | null;
  defaultCase: PricedComponent | null;
  /** Every case offered at this size — the baseline each family's row was priced with. */
  caseOptions: PricedComponent[];
  /** Every cover offered at this size. Unpriced ones keep a null MSRP, never 0. */
  coverOptions: PricedComponent[];
  currency: string;
};

export function isBolsterLength(v: string): v is BolsterLength {
  return (BOLSTER_LENGTHS as readonly string[]).includes(v);
}

async function withCategories(
  admin: SupabaseClient,
  rows: Array<{ item_id: number; quantity: number }>,
): Promise<ComposedBomLine[]> {
  const ids = [...new Set(rows.map((r) => r.item_id))];
  if (ids.length === 0) return [];
  const { data: items } = await admin.from("items").select("id, category").in("id", ids);
  const catById = new Map((items ?? []).map((i) => [i.id as number, String(i.category)]));
  return rows.map((l) => ({
    item_id: l.item_id,
    quantity: Number(l.quantity),
    category: catById.get(l.item_id) ?? "unknown",
  }));
}

const CASE_CATEGORIES = new Set(["case", "pillow_case", "bolster_case"]);

/**
 * The cover and case a pillow's BOM ships, plus every case offered at that size —
 * priced, and tagged with the `items.price_family` that selects a Costings row.
 *
 * Case options are loaded (not just the BOM's own) because a family's row was priced
 * with that family's case, and the shopper may pick a family the BOM does not use.
 */
async function loadPillowComponents(
  admin: SupabaseClient,
  size: string,
  bomLines: ComposedBomLine[],
): Promise<{
  defaultCover: PricedComponent | null;
  defaultCase: PricedComponent | null;
  caseOptions: PricedComponent[];
  coverOptions: PricedComponent[];
}> {
  const bomCover = bomLines.find((l) => l.category === "cover") ?? null;
  const bomCase = bomLines.find((l) => CASE_CATEGORIES.has(l.category)) ?? null;
  const bomCoverId = bomCover?.item_id ?? null;
  const bomCaseId = bomCase?.item_id ?? null;

  // Must match what the shopper is actually offered — `getPillowComponents` keeps an
  // item whose size matches OR is null, and still accepts the legacy `case` category.
  // A narrower set here meant a cover or case the picker showed was absent from the
  // pricing inputs, so the preview refused (and silently fell back to the shelf price)
  // while the server priced it from its real MSRP. Shown 170, authorised 245.
  // `.or()` takes a raw PostgREST filter string, so `size` is interpolated into a
  // query language. It arrives from a stored column rather than a request body, but
  // that is a property of today's callers, not of this function.
  const safeSize = /^[A-Za-z0-9_-]{1,16}$/.test(size) ? size : null;
  const { data: optionItems } = safeSize
    ? await admin
        .from("items")
        .select("id, category, price_family, size")
        .in("category", ["pillow_case", "case", "cover"])
        .or(`size.eq.${safeSize},size.is.null`)
        .eq("is_active", true)
    : { data: [] as Array<{ id: number; category: string; price_family: string | null; size: string | null }> };
  const caseItems = (optionItems ?? []).filter((i) => CASE_CATEGORIES.has(String(i.category)));
  const coverItems = (optionItems ?? []).filter((i) => i.category === "cover");

  const ids = [
    ...new Set([
      ...(optionItems ?? []).map((i) => i.id as number),
      ...(bomCoverId == null ? [] : [bomCoverId]),
      ...(bomCaseId == null ? [] : [bomCaseId]),
    ]),
  ];
  const { data: prices } = ids.length
    ? await admin.from("item_prices").select("item_id, msrp").in("item_id", ids)
    : { data: [] as Array<{ item_id: number; msrp: number | null }> };
  const msrpByItem = new Map<number, number>();
  for (const p of prices ?? []) {
    if (p.msrp != null) msrpByItem.set(p.item_id, Number(p.msrp));
  }
  const familyByItem = new Map<number, string | null>(
    caseItems.map((i) => [i.id as number, (i.price_family as string | null) ?? null]),
  );

  const caseOptions: PricedComponent[] = caseItems.map((i) => ({
    item_id: i.id as number,
    msrp: msrpByItem.get(i.id as number) ?? null,
    family: (i.price_family as string | null) ?? null,
  }));
  const coverOptions: PricedComponent[] = coverItems.map((i) => ({
    item_id: i.id as number,
    msrp: msrpByItem.get(i.id as number) ?? null,
  }));

  return {
    defaultCover:
      bomCoverId == null
        ? null
        : {
            item_id: bomCoverId,
            msrp: msrpByItem.get(bomCoverId) ?? null,
            quantity: bomCover?.quantity ?? 1,
          },
    defaultCase:
      bomCaseId == null
        ? null
        : {
            item_id: bomCaseId,
            msrp: msrpByItem.get(bomCaseId) ?? null,
            family: familyByItem.get(bomCaseId) ?? null,
            quantity: bomCase?.quantity ?? 1,
          },
    caseOptions,
    coverOptions,
  };
}

/** Load BOM lines and Costings MSRP for a composed sellable. */
export async function loadComposedSellable(
  admin: SupabaseClient,
  key: ComposedSellableKey,
): Promise<
  | { ok: true; sellable: ComposedSellable }
  | {
      ok: false;
      error: string;
      code?: "no_price" | "ambiguous_price" | "unpriced_component";
    }
> {
  if (key.productType === "pillow") {
    const { data: pillowProduct } = await admin
      .from("pillow_products")
      .select("id")
      .eq("size", key.size)
      .eq("kind", key.tier)
      .eq("is_active", true)
      .maybeSingle();
    if (!pillowProduct) {
      return {
        ok: false,
        error: `No active composed sellable for size ${key.size} tier ${key.tier}`,
      };
    }

    // Premium is priced per case fabric family: `product_prices.variant` is
    // 'linen' | 'fibrecool', basic and bolster carry one unkeyed row. Two rows are
    // normal here, so this reads them all rather than maybeSingle() — which errored,
    // returned null, and surfaced to shoppers as "not available for purchase yet".
    const [{ data: bomLines, error: bomErr }, { data: priceRows }] = await Promise.all([
      admin.from("bom_lines").select("item_id, quantity").eq("product_id", pillowProduct.id),
      admin
        .from("product_prices")
        .select("key, variant, msrp, currency")
        .eq("kind", "pillow")
        .eq("product_id", pillowProduct.id),
    ]);
    if (bomErr) return { ok: false, error: bomErr.message };

    const priced = (priceRows ?? []).filter((r) => r.msrp != null);
    const msrpByFamily: Record<string, number> = {};
    for (const r of priced) {
      const family = (r.variant as string | null) ?? UNKEYED;
      // Two rows for the SAME family is still unresolvable — the original bug, now
      // narrowed to the case it actually is rather than "more than one row".
      if (msrpByFamily[family] != null) {
        return {
          ok: false,
          code: "ambiguous_price",
          error:
            `Composed sellable for size ${key.size} tier ${key.tier} has two Costings ` +
            `MSRPs for variant "${family}" (${priced.map((x) => x.key).join(", ")}). ` +
            "Exactly one row per size x tier x case fabric family is expected.",
        };
      }
      msrpByFamily[family] = Number(r.msrp);
    }
    if (Object.keys(msrpByFamily).length === 0) {
      return {
        ok: false,
        code: "no_price",
        error: `Composed sellable has no Costings MSRP for size ${key.size} tier ${key.tier}`,
      };
    }

    const composedBom = await withCategories(admin, bomLines ?? []);
    const components = await loadPillowComponents(admin, key.size, composedBom);

    // The shelf price: this pillow exactly as its BOM ships it. Stored as `msrp` so
    // every existing reader (storefront variant, display) keeps its meaning.
    const shelf = priceComposedBuild({
      msrpByFamily,
      defaultCover: components.defaultCover,
      defaultCase: components.defaultCase,
      caseOptions: components.caseOptions,
      chosenCover: null,
      chosenCase: null,
      addonLines: [],
    });
    return {
      ok: true,
      sellable: {
        bomLines: composedBom,
        msrp: shelf.ok ? shelf.subtotal : null,
        priceFault: shelf.ok ? null : { code: shelf.code, error: shelf.error },
        msrpByFamily,
        defaultCover: components.defaultCover,
        defaultCase: components.defaultCase,
        caseOptions: components.caseOptions,
        coverOptions: components.coverOptions,
        currency: (priced[0]?.currency as string) ?? "SGD",
      },
    };
  }

  const length = key.length;
  const [{ data: bomLines, error: bomErr }, { data: productPrice }] = await Promise.all([
    admin.from("bolster_bom_lines").select("item_id, quantity").eq("variant", length),
    admin
      .from("product_prices")
      .select("msrp, currency")
      .eq("kind", "bolster")
      .eq("variant", length)
      .maybeSingle(),
  ]);
  if (bomErr) return { ok: false, error: bomErr.message };

  const msrp = productPrice?.msrp != null ? Number(productPrice.msrp) : null;
  if (msrp == null) {
    return {
      ok: false,
      code: "no_price",
      error: `Composed sellable has no Costings MSRP for bolster length ${length}`,
    };
  }

  // A bolster has one price and no fabric-family split, so it prices through the
  // same unkeyed path basic uses. Its cover and case still come from its own BOM:
  // every bolster length ships a priced `bolster_case`, and leaving these null made
  // the baseline of a case swap unknown — which reads as "unpriced component" and
  // refuses the build outright.
  const composedBom = await withCategories(admin, bomLines ?? []);
  const bomCover = composedBom.find((l) => l.category === "cover") ?? null;
  const bomCase = composedBom.find((l) => CASE_CATEGORIES.has(l.category)) ?? null;
  const componentIds = [bomCover?.item_id, bomCase?.item_id].filter(
    (id): id is number => id != null,
  );
  const { data: componentPrices } = componentIds.length
    ? await admin.from("item_prices").select("item_id, msrp").in("item_id", componentIds)
    : { data: [] as Array<{ item_id: number; msrp: number | null }> };
  const componentMsrp = new Map<number, number>();
  for (const p of componentPrices ?? []) {
    if (p.msrp != null) componentMsrp.set(Number(p.item_id), Number(p.msrp));
  }
  const asComponent = (line: ComposedBomLine | null): PricedComponent | null =>
    line == null
      ? null
      : {
          item_id: line.item_id,
          msrp: componentMsrp.get(line.item_id) ?? null,
          quantity: line.quantity,
        };

  return {
    ok: true,
    sellable: {
      bomLines: composedBom,
      msrp,
      priceFault: null,
      msrpByFamily: { [UNKEYED]: msrp },
      defaultCover: asComponent(bomCover),
      defaultCase: asComponent(bomCase),
      // No fabric families exist for bolsters, so there is no per-family baseline to
      // derive: a swap is measured against the BOM's own case.
      caseOptions: [],
      coverOptions: [],
      currency: (productPrice?.currency as string) ?? "SGD",
    },
  };
}

/** Read persisted Default Filling Template id for a product card. */
export async function getDefaultFillingTemplateId(
  admin: SupabaseClient,
  key: ComposedSellableKey,
): Promise<number | null> {
  if (key.productType === "pillow") {
    const { data } = await admin
      .from("pillow_products")
      .select("default_filling_template_id")
      .eq("size", key.size)
      .eq("kind", key.tier)
      .eq("is_active", true)
      .maybeSingle();
    const id = data?.default_filling_template_id;
    return id != null ? Number(id) : null;
  }

  const { data } = await admin
    .from("bolster_length_config")
    .select("default_filling_template_id")
    .eq("variant", key.length)
    .maybeSingle();
  const id = data?.default_filling_template_id;
  return id != null ? Number(id) : null;
}

/** Persist Default Filling Template id for a product card (nullable to clear). */
export async function setDefaultFillingTemplateId(
  admin: SupabaseClient,
  key: ComposedSellableKey,
  templateId: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (templateId != null) {
    const { data: template, error: tplErr } = await admin
      .from("bom_templates")
      .select("kind, key, role, is_active")
      .eq("id", templateId)
      .maybeSingle();
    if (tplErr) return { ok: false, error: tplErr.message };
    if (!template) return { ok: false, error: "Filling Template not found" };
    // Membership decides scope: a recipe shared into this size is a legitimate
    // default for it, even though its primary `key` names a different size.
    const served = await loadTemplateKeys(admin, [templateId]);
    if (!served.ok) return served;
    const valid = validateDefaultFillingTemplate(
      { ...(template as FillingTemplateLike), keys: served.byId.get(templateId) },
      key,
    );
    if (!valid.ok) return valid;
  }

  if (key.productType === "pillow") {
    const { data: row, error: findErr } = await admin
      .from("pillow_products")
      .select("id")
      .eq("size", key.size)
      .eq("kind", key.tier)
      .eq("is_active", true)
      .maybeSingle();
    if (findErr) return { ok: false, error: findErr.message };
    if (!row) {
      return {
        ok: false,
        error: `No active composed sellable for size ${key.size} tier ${key.tier}`,
      };
    }
    const { error: upErr } = await admin
      .from("pillow_products")
      .update({ default_filling_template_id: templateId })
      .eq("id", row.id);
    if (upErr) return { ok: false, error: upErr.message };
    return { ok: true };
  }

  const { error: upErr } = await admin
    .from("bolster_length_config")
    .update({ default_filling_template_id: templateId })
    .eq("variant", key.length);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true };
}
