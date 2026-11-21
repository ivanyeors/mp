import type { SupabaseClient } from "@supabase/supabase-js";
import { filterSelectableFillingTemplates } from "@/lib/filling-templates";
import { templateIdsForKey } from "@/lib/filling-templates/membership";
import { formatFillingPreview, type FillingItemMeta } from "@/lib/filling-preview";
import { derivePackList } from "@/lib/spatial-fillings";
import {
  getDefaultFillingTemplateId,
  loadComposedSellable,
  type ComposedSellableKey,
} from "@/lib/results/composed-sellable";

export type AssignPrepProductLine = {
  category: string;
  label: string;
  qty: number;
};

export type AssignPrepDefault = {
  id: number;
  name: string;
  preview: ReturnType<typeof formatFillingPreview>;
};

export type AssignPrep = {
  productLines: AssignPrepProductLine[];
  defaultFillingTemplate: AssignPrepDefault | null;
  sizeDefaultFillingTemplate: AssignPrepDefault | null;
  hintSource: "engine" | "default";
  fillingTemplates: Array<{ id: number; name: string }>;
};

function itemLabel(name: string, subtype: string | null | undefined): string {
  return subtype ? `${name} (${subtype})` : name;
}

async function loadTemplatePreview(
  admin: SupabaseClient,
  key: ComposedSellableKey,
  templateId: number,
  templates: Array<{ id: unknown; name: unknown }>,
  sizeKey: string,
): Promise<AssignPrepDefault | null> {
  const def = templates.find((t) => Number(t.id) === templateId);
  if (!def) return null;

  const { data: defLines, error: linesErr } = await admin
    .from("bom_template_lines")
    .select("item_id, quantity")
    .eq("template_id", templateId);
  if (linesErr) return null;

  let defPlacements: Array<{ item_id: number }> = [];
  if (key.productType === "pillow") {
    const { data: pl, error: plErr } = await admin
      .from("filling_template_placements")
      .select("item_id")
      .eq("template_id", templateId);
    if (plErr) return null;
    defPlacements = (pl ?? []) as Array<{ item_id: number }>;
  }
  const previewLines = derivePackList(
    defPlacements,
    (defLines ?? []).map((l) => ({
      item_id: Number(l.item_id),
      quantity: Number(l.quantity),
    })),
  ).map((l) => ({ item_id: l.item_id, quantity: l.count }));

  const itemIds = previewLines.map((l) => l.item_id);
  const { data: fillItems } = itemIds.length
    ? await admin.from("items").select("id, name, subtype, size").in("id", itemIds)
    : { data: [] as Array<{ id: number; name: string; subtype: string | null; size: string | null }> };
  const itemsById = new Map<number, FillingItemMeta>(
    (fillItems ?? []).map((i) => [
      Number(i.id),
      { name: i.name, subtype: i.subtype, size: i.size },
    ]),
  );

  return {
    id: templateId,
    name: String(def.name),
    preview: formatFillingPreview(previewLines, itemsById, sizeKey),
  };
}

export async function loadAssignPrep(
  admin: SupabaseClient,
  key: ComposedSellableKey,
  opts?: { preferredTemplateId?: number | null; hintSource?: "engine" | "default" },
): Promise<{ ok: true; prep: AssignPrep } | { ok: false; error: string }> {
  const composed = await loadComposedSellable(admin, key);
  if (!composed.ok) return composed;

  const sizeKey = key.productType === "pillow" ? key.size : key.length;

  const members = await templateIdsForKey(admin, sizeKey);
  if (!members.ok) return members;

  const [{ data: templates, error: tplErr }, defaultId] = await Promise.all([
    members.ids.length
      ? admin
          .from("bom_templates")
          .select("id, kind, key, role, is_active, name")
          .eq("kind", key.productType)
          .eq("role", "filling")
          .in("id", members.ids)
      : Promise.resolve({ data: [], error: null }),
    getDefaultFillingTemplateId(admin, key),
  ]);
  if (tplErr) return { ok: false, error: tplErr.message };

  const withKeys = (templates ?? []).map((t) => ({ ...t, keys: [sizeKey] }));
  const selectable = filterSelectableFillingTemplates(withKeys, {
    productType: key.productType,
    size: sizeKey,
  });

  let sizeDefaultFillingTemplate: AssignPrepDefault | null = null;
  if (defaultId != null) {
    sizeDefaultFillingTemplate = await loadTemplatePreview(
      admin,
      key,
      defaultId,
      templates ?? [],
      sizeKey,
    );
  }

  const preferred =
    opts?.preferredTemplateId != null &&
    selectable.some((t) => Number(t.id) === opts.preferredTemplateId)
      ? opts.preferredTemplateId
      : null;

  const hintSource: "engine" | "default" =
    preferred != null && opts?.hintSource === "engine" ? "engine" : "default";

  let defaultFillingTemplate: AssignPrepDefault | null = sizeDefaultFillingTemplate;
  if (preferred != null) {
    defaultFillingTemplate =
      (await loadTemplatePreview(admin, key, preferred, templates ?? [], sizeKey)) ??
      sizeDefaultFillingTemplate;
  }

  const nonFilling = composed.sellable.bomLines.filter((l) => l.category !== "filling");
  const productItemIds = nonFilling.map((l) => l.item_id);
  const { data: productItems } = productItemIds.length
    ? await admin.from("items").select("id, name, subtype, category").in("id", productItemIds)
    : { data: [] as Array<{ id: number; name: string; subtype: string | null; category: string }> };
  const productById = new Map((productItems ?? []).map((i) => [Number(i.id), i]));

  const productLines = nonFilling.map((l) => {
    const item = productById.get(l.item_id);
    return {
      category: l.category,
      label: item ? itemLabel(item.name, item.subtype) : `Item #${l.item_id}`,
      qty: l.quantity,
    };
  });

  return {
    ok: true,
    prep: {
      productLines,
      defaultFillingTemplate,
      sizeDefaultFillingTemplate,
      hintSource,
      fillingTemplates: selectable.map((t) => ({
        id: Number(t.id),
        name: String(t.name),
      })),
    },
  };
}
