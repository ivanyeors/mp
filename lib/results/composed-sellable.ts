/** Composed sellable BOM + Costings MSRP for pillow (size×tier) or bolster (length). */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  validateDefaultFillingTemplate,
  type FillingTemplateLike,
} from "@/lib/filling-templates";

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
  msrp: number;
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

/** Load BOM lines and Costings MSRP for a composed sellable. */
export async function loadComposedSellable(
  admin: SupabaseClient,
  key: ComposedSellableKey,
): Promise<{ ok: true; sellable: ComposedSellable } | { ok: false; error: string }> {
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

    const [{ data: bomLines, error: bomErr }, { data: productPrice }] = await Promise.all([
      admin.from("bom_lines").select("item_id, quantity").eq("product_id", pillowProduct.id),
      admin
        .from("product_prices")
        .select("msrp, currency")
        .eq("kind", "pillow")
        .eq("product_id", pillowProduct.id)
        .maybeSingle(),
    ]);
    if (bomErr) return { ok: false, error: bomErr.message };

    const msrp = productPrice?.msrp != null ? Number(productPrice.msrp) : null;
    if (msrp == null) {
      return {
        ok: false,
        error: `Composed sellable has no Costings MSRP for size ${key.size} tier ${key.tier}`,
      };
    }

    return {
      ok: true,
      sellable: {
        bomLines: await withCategories(admin, bomLines ?? []),
        msrp,
        currency: (productPrice?.currency as string) ?? "SGD",
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
      error: `Composed sellable has no Costings MSRP for bolster length ${length}`,
    };
  }

  return {
    ok: true,
    sellable: {
      bomLines: await withCategories(admin, bomLines ?? []),
      msrp,
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
    const valid = validateDefaultFillingTemplate(template as FillingTemplateLike, key);
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
