import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import { preferenceRoleOf } from "@/lib/build-assembly";
import { loadFillingTemplatePack } from "@/lib/filling-templates/pack";
import { isResultOrderBuildSnapshot } from "@/lib/results/order-build-snapshot";

export type InventoryLine = { item_id: number; quantity: number };

export type CategorisedLine = InventoryLine & { category: string };

export interface OrderItemForDeduction {
  variant_id: string | null;
  quantity: number;
  kind?: string | null;
  customization_id?: string | null;
  customization_snapshot?: Record<string, unknown> | null;
}

type CustomizationSnapshot = {
  product_type?: string;
  bolster_variant?: string;
  config_lines?: Array<InventoryLine & { category?: string }>;
  filling_lines?: InventoryLine[];
};

export type StockVariant = {
  pillow_product_id: number | null;
  item_id: number | null;
  track_inventory: boolean;
  option1: string | null;
};

const BOLSTER_VARIANTS = new Set(["short", "medium", "long"]);

export function isBolsterVariant(value: string | null | undefined): value is "short" | "medium" | "long" {
  return !!value && BOLSTER_VARIANTS.has(value);
}

export function isBolsterCustomizedItem(
  variant: { pillow_product_id: number | null },
  item: Pick<OrderItemForDeduction, "customization_id" | "customization_snapshot">,
  snapshot: CustomizationSnapshot
): boolean {
  return (
    !!item.customization_id &&
    !!item.customization_snapshot &&
    (snapshot.product_type === "bolster" ||
      (!variant.pillow_product_id && isBolsterVariant(snapshot.bolster_variant)))
  );
}

export function mergeBuildLines(chosen: CategorisedLine[], defaults: CategorisedLine[]): InventoryLine[] {
  const chosenItems = new Set(chosen.map((l) => l.item_id));
  const chosenRoles = new Set(chosen.map((l) => preferenceRoleOf(l.category)));
  const choseFillings = chosen.some((l) => l.category === "filling");
  const kept = defaults.filter((l) => {
    if (chosenItems.has(l.item_id)) return false;
    if (l.category === "filling") return !choseFillings;
    const role = preferenceRoleOf(l.category);
    return !role || !chosenRoles.has(role);
  });
  return [...chosen, ...kept]
    .filter((l) => l.quantity > 0)
    .map((l) => ({ item_id: l.item_id, quantity: l.quantity }));
}

export function buildSaleDeductionTransactions(
  lines: InventoryLine[],
  orderQuantity: number,
  orderId: string,
  customizationId?: string | null
) {
  return lines.map((line) => ({
    item_id: line.item_id,
    quantity_signed: -(line.quantity * orderQuantity),
    reason: "sale" as const,
    metadata: customizationId ? { order_id: orderId, customization_id: customizationId } : { order_id: orderId },
  }));
}

function chosenLines(snapshot: CustomizationSnapshot): CategorisedLine[] {
  return [
    ...(snapshot.config_lines ?? []).map((l) => ({
      item_id: Number(l.item_id),
      quantity: Number(l.quantity),
      category: l.category ?? "",
    })),
    ...(snapshot.filling_lines ?? []).map((l) => ({
      item_id: Number(l.item_id),
      quantity: Number(l.quantity),
      category: "filling",
    })),
  ];
}

type BomRow = { item_id: number; quantity: number; items: { category: string } | { category: string }[] };

async function composedDefaults(
  admin: SupabaseClient,
  bom: { data: BomRow[] | null; error: { message: string } | null },
  defaultFillingTemplateId: number | null,
  withFillings: boolean,
): Promise<CategorisedLine[]> {
  if (bom.error) throw new Error(bom.error.message);
  const recipe = (bom.data ?? [])
    .map((bl) => ({
      item_id: Number(bl.item_id),
      quantity: Number(bl.quantity),
      category: String((Array.isArray(bl.items) ? bl.items[0] : bl.items)?.category ?? ""),
    }))
    .filter((l) => l.category !== "filling");
  if (!withFillings || defaultFillingTemplateId == null) return recipe;
  const pack = await loadFillingTemplatePack(admin, defaultFillingTemplateId);
  return [...recipe, ...pack.map((l) => ({ ...l, category: "filling" }))];
}

async function pillowDefaults(
  admin: SupabaseClient,
  pillowProductId: number,
  withFillings: boolean,
): Promise<CategorisedLine[]> {
  const [bom, { data: product, error }] = await Promise.all([
    admin.from("bom_lines").select("item_id, quantity, items!inner(category)").eq("product_id", pillowProductId),
    admin.from("pillow_products").select("default_filling_template_id").eq("id", pillowProductId).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  const templateId = product?.default_filling_template_id;
  return composedDefaults(admin, bom, templateId != null ? Number(templateId) : null, withFillings);
}

async function bolsterDefaults(
  admin: SupabaseClient,
  length: "short" | "medium" | "long",
  withFillings: boolean,
): Promise<CategorisedLine[]> {
  const [bom, { data: config, error }] = await Promise.all([
    admin.from("bolster_bom_lines").select("item_id, quantity, items!inner(category)").eq("variant", length),
    admin.from("bolster_length_config").select("default_filling_template_id").eq("variant", length).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  const templateId = config?.default_filling_template_id;
  return composedDefaults(admin, bom, templateId != null ? Number(templateId) : null, withFillings);
}

export type ComposedSellableRef = { pillowProductId: number } | { length: "short" | "medium" | "long" };

export async function composedBuildLines(
  admin: SupabaseClient,
  sellable: ComposedSellableRef,
  chosen: CategorisedLine[],
): Promise<InventoryLine[]> {
  const withFillings = !chosen.some((l) => l.category === "filling");
  const defaults =
    "pillowProductId" in sellable
      ? await pillowDefaults(admin, sellable.pillowProductId, withFillings)
      : await bolsterDefaults(admin, sellable.length, withFillings);
  return mergeBuildLines(chosen, defaults);
}

export async function stockLinesForOrderItem(
  admin: SupabaseClient,
  variant: StockVariant,
  item: Pick<OrderItemForDeduction, "customization_id" | "customization_snapshot">,
): Promise<InventoryLine[] | null> {
  if (!variant.track_inventory) return [];
  const snapshot = (item.customization_snapshot ?? {}) as CustomizationSnapshot;
  const chosen = item.customization_id && item.customization_snapshot ? chosenLines(snapshot) : [];

  if (isBolsterCustomizedItem(variant, item, snapshot)) {
    const length =
      (isBolsterVariant(snapshot.bolster_variant) ? snapshot.bolster_variant : null) ??
      (isBolsterVariant(variant.option1?.toLowerCase()) ? variant.option1!.toLowerCase() : null);
    if (!isBolsterVariant(length)) return [];
    return composedBuildLines(admin, { length }, chosen);
  }

  if (variant.pillow_product_id) {
    return composedBuildLines(admin, { pillowProductId: variant.pillow_product_id }, chosen);
  }

  const length = variant.option1?.toLowerCase();
  if (isBolsterVariant(length)) return composedBuildLines(admin, { length }, []);

  if (variant.item_id) return [{ item_id: variant.item_id, quantity: 1 }];

  return null;
}

function resultSaleRows(orderId: string, item: OrderItemForDeduction) {
  const snapshot = item.customization_snapshot;
  if (!isResultOrderBuildSnapshot(snapshot)) return [];
  return snapshot.build_lines
    .filter((l) => l.quantity > 0)
    .map((l) => ({
      item_id: l.item_id,
      quantity_signed: -(l.quantity * item.quantity),
      reason: "sale" as const,
      metadata: { order_id: orderId, result_id: snapshot.result_id, role: l.role },
    }));
}

export async function deductInventoryForOrder(
  orderId: string,
  items: OrderItemForDeduction[],
  admin: SupabaseClient = supabaseAdmin(),
): Promise<void> {
  const transactions: Array<Record<string, unknown>> = [];
  const manualStock: Array<{ variantId: string; quantity: number }> = [];

  for (const item of items) {
    if (item.kind === "service") continue;
    if (!item.variant_id) {
      transactions.push(...resultSaleRows(orderId, item));
      continue;
    }

    const { data: variant, error: variantError } = await admin
      .from("product_variants")
      .select("id, pillow_product_id, item_id, track_inventory, stock_quantity, option1")
      .eq("id", item.variant_id)
      .maybeSingle();

    if (variantError) throw new Error(`Variant ${item.variant_id} could not be read: ${variantError.message}`);
    if (!variant) continue;

    const lines = await stockLinesForOrderItem(admin, variant, item);
    if (lines === null) {
      manualStock.push({
        variantId: item.variant_id,
        quantity: Math.max(0, (variant.stock_quantity ?? 0) - item.quantity),
      });
      continue;
    }
    transactions.push(...buildSaleDeductionTransactions(lines, item.quantity, orderId, item.customization_id));
  }

  if (transactions.length > 0) {
    const { error } = await admin.from("inventory_transactions").insert(transactions);
    if (error) throw new Error(error.message);
  }
  for (const m of manualStock) {
    const { error } = await admin
      .from("product_variants")
      .update({ stock_quantity: m.quantity })
      .eq("id", m.variantId);
    if (error) throw new Error(error.message);
  }
}
