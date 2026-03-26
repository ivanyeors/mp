import { supabaseAdmin } from "@/lib/supabase/server";
interface OrderItemForDeduction {
  variant_id: string | null;
  quantity: number;
  customization_id?: string | null;
  customization_snapshot?: Record<string, unknown> | null;
}

/**
 * Deduct inventory for an order's items using proper BOM-aware logic.
 *
 * - Customized pillows: use config_lines from customization snapshot
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

    // Fetch variant details
    const { data: variant } = await admin
      .from("product_variants")
      .select("id, pillow_product_id, item_id, track_inventory, stock_quantity")
      .eq("id", item.variant_id)
      .single();

    if (!variant || !variant.track_inventory) continue;

    // Case 1: Customized pillow order
    if (variant.pillow_product_id && item.customization_id && item.customization_snapshot) {
      const snapshot = item.customization_snapshot as { config_lines?: { item_id: number; quantity: number }[]; filling_lines?: { item_id: number; quantity: number }[] };
      const allLines: { item_id: number; quantity: number }[] = [
        ...(snapshot.config_lines ?? []),
        ...(snapshot.filling_lines ?? []).map((fl) => ({
          item_id: fl.item_id,
          quantity: fl.quantity,
        })),
      ];

      // Also deduct non-filling BOM components (cover, case, protector, packaging)
      const { data: bomLines } = await admin
        .from("bom_lines")
        .select("item_id, quantity, items!inner(category)")
        .eq("product_id", variant.pillow_product_id);

      const nonFillingBom = (bomLines ?? []).filter(
        (bl: Record<string, unknown>) => {
          const items = bl.items as Record<string, unknown> | Record<string, unknown>[];
          const cat = Array.isArray(items) ? (items[0] as Record<string, unknown>)?.category : (items as Record<string, unknown>)?.category;
          return cat !== "filling";
        }
      );

      // Check if config_lines already has non-filling items
      const configItemIds = new Set(allLines.map((l) => l.item_id));

      for (const bl of nonFillingBom) {
        const bomLine = bl as unknown as { item_id: number; quantity: number };
        if (!configItemIds.has(bomLine.item_id)) {
          allLines.push({ item_id: bomLine.item_id, quantity: bomLine.quantity });
        }
      }

      // Create inventory transactions for each component
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

    // Case 2: Standard pillow (no customization) — use default BOM
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

    // Case 3: Item-linked variant (accessory/part)
    if (variant.item_id) {
      await admin.from("inventory_transactions").insert({
        item_id: variant.item_id,
        quantity_signed: -item.quantity,
        reason: "sale",
        metadata: { order_id: orderId },
      });
      continue;
    }

    // Case 4: Manual stock tracking (fallback)
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
      .select("id, pillow_product_id, item_id, track_inventory, stock_quantity")
      .eq("id", item.variant_id)
      .single();

    if (!variant || !variant.track_inventory) continue;

    // Case 1: Customized pillow
    if (variant.pillow_product_id && item.customization_id && item.customization_snapshot) {
      const snapshot = item.customization_snapshot as { config_lines?: { item_id: number; quantity: number }[]; filling_lines?: { item_id: number; quantity: number }[] };
      const allLines: { item_id: number; quantity: number }[] = [
        ...(snapshot.config_lines ?? []),
        ...(snapshot.filling_lines ?? []).map((fl) => ({
          item_id: fl.item_id,
          quantity: fl.quantity,
        })),
      ];

      const { data: bomLines } = await admin
        .from("bom_lines")
        .select("item_id, quantity, items!inner(category)")
        .eq("product_id", variant.pillow_product_id);

      const nonFillingBom = (bomLines ?? []).filter(
        (bl: Record<string, unknown>) => {
          const items = bl.items as Record<string, unknown> | Record<string, unknown>[];
          const cat = Array.isArray(items) ? (items[0] as Record<string, unknown>)?.category : (items as Record<string, unknown>)?.category;
          return cat !== "filling";
        }
      );

      const configItemIds = new Set(allLines.map((l) => l.item_id));
      for (const bl of nonFillingBom) {
        const bomLine = bl as unknown as { item_id: number; quantity: number };
        if (!configItemIds.has(bomLine.item_id)) {
          allLines.push({ item_id: bomLine.item_id, quantity: bomLine.quantity });
        }
      }

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

    // Case 2: Standard pillow
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

    // Case 3: Item-linked
    if (variant.item_id) {
      await admin.from("inventory_transactions").insert({
        item_id: variant.item_id,
        quantity_signed: item.quantity,
        reason: "correction",
        metadata: { order_id: orderId, refund: true },
      });
      continue;
    }

    // Case 4: Manual
    await admin
      .from("product_variants")
      .update({ stock_quantity: (variant.stock_quantity ?? 0) + item.quantity })
      .eq("id", item.variant_id);
  }
}
