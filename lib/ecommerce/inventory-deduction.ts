import { supabaseAdmin } from "@/lib/supabase/server";

export type InventoryLine = { item_id: number; quantity: number };

interface OrderItemForDeduction {
  variant_id: string | null;
  quantity: number;
  customization_id?: string | null;
  customization_snapshot?: Record<string, unknown> | null;
}

type CustomizationSnapshot = {
  product_type?: string;
  bolster_variant?: string;
  config_lines?: InventoryLine[];
  filling_lines?: InventoryLine[];
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

/**
 * Merge user-selected config lines with non-filling BOM defaults.
 * Config lines take precedence; BOM lines fill gaps for items not in the config.
 */
export function mergeConfigLinesWithNonFillingBom(
  configLines: InventoryLine[],
  nonFillingBomLines: InventoryLine[]
): InventoryLine[] {
  const allLines: InventoryLine[] = [...configLines];
  const configItemIds = new Set(allLines.map((l) => l.item_id));

  for (const bomLine of nonFillingBomLines) {
    if (!configItemIds.has(bomLine.item_id)) {
      allLines.push({ item_id: bomLine.item_id, quantity: bomLine.quantity });
    }
  }

  return allLines;
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
    metadata: { order_id: orderId, customization_id: customizationId },
  }));
}

function filterNonFillingBomLines(bomLines: Record<string, unknown>[]): InventoryLine[] {
  return bomLines
    .filter((bl) => {
      const items = bl.items as Record<string, unknown> | Record<string, unknown>[];
      const cat = Array.isArray(items)
        ? (items[0] as Record<string, unknown>)?.category
        : (items as Record<string, unknown>)?.category;
      return cat !== "filling";
    })
    .map((bl) => ({
      item_id: (bl as unknown as InventoryLine).item_id,
      quantity: (bl as unknown as InventoryLine).quantity,
    }));
}

async function mergeBolsterCustomLines(
  bolsterVariant: "short" | "medium" | "long",
  configLines: InventoryLine[]
): Promise<InventoryLine[]> {
  const admin = supabaseAdmin();

  const { data: bomLines } = await admin
    .from("bolster_bom_lines")
    .select("item_id, quantity, items!inner(category)")
    .eq("variant", bolsterVariant);

  return mergeConfigLinesWithNonFillingBom(configLines, filterNonFillingBomLines(bomLines ?? []));
}

async function mergePillowCustomLines(
  pillowProductId: number,
  snapshot: CustomizationSnapshot
): Promise<InventoryLine[]> {
  const admin = supabaseAdmin();
  const configAndFilling: InventoryLine[] = [
    ...(snapshot.config_lines ?? []),
    ...(snapshot.filling_lines ?? []).map((fl) => ({
      item_id: fl.item_id,
      quantity: fl.quantity,
    })),
  ];

  const { data: bomLines } = await admin
    .from("bom_lines")
    .select("item_id, quantity, items!inner(category)")
    .eq("product_id", pillowProductId);

  return mergeConfigLinesWithNonFillingBom(configAndFilling, filterNonFillingBomLines(bomLines ?? []));
}

/**
 * Deduct inventory for an order's items using proper BOM-aware logic.
 *
 * - Customized bolsters: use config_lines from customization snapshot + bolster BOM defaults
 * - Customized pillows: use config_lines from customization snapshot
 * - Standard bolsters: use bolster_bom_lines via variant option1
 * - Standard pillows: use default BOM lines
 * - Item-linked variants: deduct from that item
 * - Manual variants: decrement stock_quantity
 */
export async function deductInventoryForOrder(
  orderId: string,
  items: OrderItemForDeduction[]
): Promise<void> {
  const admin = supabaseAdmin();

  for (const item of items) {
    if (!item.variant_id) continue;

    const { data: variant } = await admin
      .from("product_variants")
      .select("id, pillow_product_id, item_id, track_inventory, stock_quantity, option1")
      .eq("id", item.variant_id)
      .single();

    if (!variant || !variant.track_inventory) continue;

    const snapshot = (item.customization_snapshot ?? {}) as CustomizationSnapshot;

    // Case 1: Customized bolster order
    if (isBolsterCustomizedItem(variant, item, snapshot)) {
      const bolsterVariant =
        (isBolsterVariant(snapshot.bolster_variant) ? snapshot.bolster_variant : null) ??
        (isBolsterVariant(variant.option1?.toLowerCase()) ? variant.option1!.toLowerCase() : null);

      if (!bolsterVariant) continue;

      const allLines = await mergeBolsterCustomLines(bolsterVariant, snapshot.config_lines ?? []);
      const transactions = buildSaleDeductionTransactions(
        allLines,
        item.quantity,
        orderId,
        item.customization_id
      );

      if (transactions.length > 0) {
        await admin.from("inventory_transactions").insert(transactions);
      }
      continue;
    }

    // Case 2: Customized pillow order
    if (variant.pillow_product_id && item.customization_id && item.customization_snapshot) {
      const allLines = await mergePillowCustomLines(variant.pillow_product_id, snapshot);
      const transactions = allLines.map((line) => ({
        item_id: line.item_id,
        quantity_signed: -(line.quantity * item.quantity),
        reason: "sale" as const,
        metadata: { order_id: orderId, customization_id: item.customization_id },
      }));

      if (transactions.length > 0) {
        await admin.from("inventory_transactions").insert(transactions);
      }
      continue;
    }

    // Case 3: Standard pillow (no customization) — use default BOM
    if (variant.pillow_product_id) {
      const { data: bomLines } = await admin
        .from("bom_lines")
        .select("item_id, quantity")
        .eq("product_id", variant.pillow_product_id);

      if (bomLines && bomLines.length > 0) {
        const transactions = bomLines.map((bl: { item_id: number; quantity: number }) => ({
          item_id: bl.item_id,
          quantity_signed: -(bl.quantity * item.quantity),
          reason: "sale" as const,
          metadata: { order_id: orderId },
        }));

        await admin.from("inventory_transactions").insert(transactions);
      }
      continue;
    }

    // Case 4: Standard bolster (no customization) — use bolster BOM via option1
    const bolsterVariant = variant.option1?.toLowerCase();
    if (isBolsterVariant(bolsterVariant)) {
      const { data: bomLines } = await admin
        .from("bolster_bom_lines")
        .select("item_id, quantity")
        .eq("variant", bolsterVariant);

      if (bomLines && bomLines.length > 0) {
        const transactions = bomLines.map((bl: { item_id: number; quantity: number }) => ({
          item_id: bl.item_id,
          quantity_signed: -(bl.quantity * item.quantity),
          reason: "sale" as const,
          metadata: { order_id: orderId },
        }));

        await admin.from("inventory_transactions").insert(transactions);
      }
      continue;
    }

    // Case 5: Item-linked variant (accessory/part)
    if (variant.item_id) {
      await admin.from("inventory_transactions").insert({
        item_id: variant.item_id,
        quantity_signed: -item.quantity,
        reason: "sale",
        metadata: { order_id: orderId },
      });
      continue;
    }

    // Case 6: Manual stock tracking (fallback)
    const newQty = Math.max(0, (variant.stock_quantity ?? 0) - item.quantity);
    await admin
      .from("product_variants")
      .update({ stock_quantity: newQty })
      .eq("id", item.variant_id);
  }
}

/**
 * Restore inventory for a refunded order — reverse of deductInventoryForOrder.
 */
export async function restoreInventoryForOrder(
  orderId: string,
  items: OrderItemForDeduction[]
): Promise<void> {
  const admin = supabaseAdmin();

  for (const item of items) {
    if (!item.variant_id) continue;

    const { data: variant } = await admin
      .from("product_variants")
      .select("id, pillow_product_id, item_id, track_inventory, stock_quantity, option1")
      .eq("id", item.variant_id)
      .single();

    if (!variant || !variant.track_inventory) continue;

    const snapshot = (item.customization_snapshot ?? {}) as CustomizationSnapshot;

    // Case 1: Customized bolster
    if (isBolsterCustomizedItem(variant, item, snapshot)) {
      const bolsterVariant =
        (isBolsterVariant(snapshot.bolster_variant) ? snapshot.bolster_variant : null) ??
        (isBolsterVariant(variant.option1?.toLowerCase()) ? variant.option1!.toLowerCase() : null);

      if (!bolsterVariant) continue;

      const allLines = await mergeBolsterCustomLines(bolsterVariant, snapshot.config_lines ?? []);
      const transactions = allLines.map((line) => ({
        item_id: line.item_id,
        quantity_signed: line.quantity * item.quantity,
        reason: "correction" as const,
        metadata: { order_id: orderId, refund: true },
      }));

      if (transactions.length > 0) {
        await admin.from("inventory_transactions").insert(transactions);
      }
      continue;
    }

    // Case 2: Customized pillow
    if (variant.pillow_product_id && item.customization_id && item.customization_snapshot) {
      const allLines = await mergePillowCustomLines(variant.pillow_product_id, snapshot);
      const transactions = allLines.map((line) => ({
        item_id: line.item_id,
        quantity_signed: line.quantity * item.quantity,
        reason: "correction" as const,
        metadata: { order_id: orderId, refund: true },
      }));

      if (transactions.length > 0) {
        await admin.from("inventory_transactions").insert(transactions);
      }
      continue;
    }

    // Case 3: Standard pillow
    if (variant.pillow_product_id) {
      const { data: bomLines } = await admin
        .from("bom_lines")
        .select("item_id, quantity")
        .eq("product_id", variant.pillow_product_id);

      if (bomLines && bomLines.length > 0) {
        const transactions = bomLines.map((bl: { item_id: number; quantity: number }) => ({
          item_id: bl.item_id,
          quantity_signed: bl.quantity * item.quantity,
          reason: "correction" as const,
          metadata: { order_id: orderId, refund: true },
        }));

        await admin.from("inventory_transactions").insert(transactions);
      }
      continue;
    }

    // Case 4: Standard bolster
    const bolsterVariant = variant.option1?.toLowerCase();
    if (isBolsterVariant(bolsterVariant)) {
      const { data: bomLines } = await admin
        .from("bolster_bom_lines")
        .select("item_id, quantity")
        .eq("variant", bolsterVariant);

      if (bomLines && bomLines.length > 0) {
        const transactions = bomLines.map((bl: { item_id: number; quantity: number }) => ({
          item_id: bl.item_id,
          quantity_signed: bl.quantity * item.quantity,
          reason: "correction" as const,
          metadata: { order_id: orderId, refund: true },
        }));

        await admin.from("inventory_transactions").insert(transactions);
      }
      continue;
    }

    // Case 5: Item-linked
    if (variant.item_id) {
      await admin.from("inventory_transactions").insert({
        item_id: variant.item_id,
        quantity_signed: item.quantity,
        reason: "correction",
        metadata: { order_id: orderId, refund: true },
      });
      continue;
    }

    // Case 6: Manual
    await admin
      .from("product_variants")
      .update({ stock_quantity: (variant.stock_quantity ?? 0) + item.quantity })
      .eq("id", item.variant_id);
  }
}
