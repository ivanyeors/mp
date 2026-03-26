import { supabaseAdmin } from "@/lib/supabase/server";
import type { ComponentOption, ConfigLine, FillingLine } from "@/lib/types/customization";

/**
 * Get available components (covers, cases, protectors, packaging) for a pillow product.
 * Returns items grouped by category with stock and pricing info.
 */
export async function getAvailableComponents(pillowProductId: number): Promise<{
  covers: ComponentOption[];
  cases: ComponentOption[];
  protectors: ComponentOption[];
  packaging: ComponentOption[];
}> {
  const admin = supabaseAdmin();

  // Get the pillow product to know its size
  const { data: pillowProduct } = await admin
    .from("pillow_products")
    .select("id, size, kind")
    .eq("id", pillowProductId)
    .single();

  if (!pillowProduct) {
    return { covers: [], cases: [], protectors: [], packaging: [] };
  }

  // Get BOM lines for this product (to know base quantities)
  const { data: bomLines } = await admin
    .from("bom_lines")
    .select("item_id, quantity")
    .eq("product_id", pillowProductId);

  const bomMap = new Map<number, number>(
    (bomLines ?? []).map((bl: { item_id: number; quantity: number }) => [bl.item_id, bl.quantity])
  );

  // Get items matching this pillow's size for covers, cases, protectors
  // Plus packaging items matching size category
  const { data: items } = await admin
    .from("items")
    .select("id, category, subtype, name, size")
    .eq("is_active", true)
    .in("category", ["cover", "case", "protector", "packaging"]);

  if (!items) return { covers: [], cases: [], protectors: [], packaging: [] };

  // Filter items by size compatibility
  const pillowSize = pillowProduct.size;
  const packagingSize = ["XS", "S", "M"].includes(pillowSize) ? "S" : "L";

  const relevantItems = items.filter((i: { category: string; size: string | null }) => {
    if (i.category === "packaging") {
      return i.size === packagingSize;
    }
    return i.size === pillowSize || i.size === null;
  });

  // Get stock levels
  const itemIds = relevantItems.map((i: { id: number }) => i.id);
  const { data: balances } = await admin
    .from("inventory_balances")
    .select("item_id, on_hand")
    .in("item_id", itemIds);

  const stockMap = new Map<number, number>(
    (balances ?? []).map((b: { item_id: number; on_hand: number }) => [b.item_id, b.on_hand])
  );

  // Get prices
  const { data: prices } = await admin
    .from("item_prices")
    .select("item_id, msrp")
    .in("item_id", itemIds);

  const priceMap = new Map<number, number>(
    (prices ?? []).map((p: { item_id: number; msrp: number | null }) => [p.item_id, p.msrp ?? 0])
  );

  // Build component options
  const toOption = (i: { id: number; category: string; subtype: string | null; name: string; size: string | null }): ComponentOption => ({
    item_id: i.id,
    category: i.category,
    name: i.name,
    subtype: i.subtype ?? undefined,
    size: i.size ?? undefined,
    stock_available: stockMap.get(i.id) ?? 0,
    unit_price: priceMap.get(i.id) ?? 0,
    base_quantity: bomMap.get(i.id) ?? 0,
  });

  return {
    covers: relevantItems.filter((i: { category: string }) => i.category === "cover").map(toOption),
    cases: relevantItems.filter((i: { category: string }) => i.category === "case").map(toOption),
    protectors: relevantItems.filter((i: { category: string }) => i.category === "protector").map(toOption),
    packaging: relevantItems.filter((i: { category: string }) => i.category === "packaging").map(toOption),
  };
}

/**
 * Get available components for a bolster product.
 * Similar to getAvailableComponents but for bolsters.
 */
export async function getAvailableBolsterComponents(bolsterProductId: number): Promise<{
  covers: ComponentOption[];
  cases: ComponentOption[];
  protectors: ComponentOption[];
  packaging: ComponentOption[];
}> {
  const admin = supabaseAdmin();

  // Get the bolster product to know its size
  const { data: bolsterProduct } = await admin
    .from("bolster_products")
    .select("id, size")
    .eq("id", bolsterProductId)
    .single();

  if (!bolsterProduct) {
    return { covers: [], cases: [], protectors: [], packaging: [] };
  }

  // Get BOM lines for this bolster
  const { data: bomLines } = await admin
    .from("bom_lines")
    .select("item_id, quantity")
    .eq("product_id", bolsterProductId);

  const bomMap = new Map<number, number>(
    (bomLines ?? []).map((bl: { item_id: number; quantity: number }) => [bl.item_id, bl.quantity])
  );

  // Get items matching bolster categories
  const { data: items } = await admin
    .from("items")
    .select("id, category, subtype, name, size")
    .eq("is_active", true)
    .in("category", ["cover", "case", "protector", "packaging"]);

  if (!items) return { covers: [], cases: [], protectors: [], packaging: [] };

  // Filter items by size compatibility for bolsters
  const bolsterSize = bolsterProduct.size;
  const relevantItems = items.filter((i: { category: string; size: string | null }) => {
    return i.size === bolsterSize || i.size === null;
  });

  // Get stock levels
  const itemIds = relevantItems.map((i: { id: number }) => i.id);
  if (itemIds.length === 0) return { covers: [], cases: [], protectors: [], packaging: [] };

  const { data: balances } = await admin
    .from("inventory_balances")
    .select("item_id, on_hand")
    .in("item_id", itemIds);

  const stockMap = new Map<number, number>(
    (balances ?? []).map((b: { item_id: number; on_hand: number }) => [b.item_id, b.on_hand])
  );

  // Get prices
  const { data: prices } = await admin
    .from("item_prices")
    .select("item_id, msrp")
    .in("item_id", itemIds);

  const priceMap = new Map<number, number>(
    (prices ?? []).map((p: { item_id: number; msrp: number | null }) => [p.item_id, p.msrp ?? 0])
  );

  const toOption = (i: { id: number; category: string; subtype: string | null; name: string; size: string | null }): ComponentOption => ({
    item_id: i.id,
    category: i.category,
    name: i.name,
    subtype: i.subtype ?? undefined,
    size: i.size ?? undefined,
    stock_available: stockMap.get(i.id) ?? 0,
    unit_price: priceMap.get(i.id) ?? 0,
    base_quantity: bomMap.get(i.id) ?? 0,
  });

  return {
    covers: relevantItems.filter((i: { category: string }) => i.category === "cover").map(toOption),
    cases: relevantItems.filter((i: { category: string }) => i.category === "case").map(toOption),
    protectors: relevantItems.filter((i: { category: string }) => i.category === "protector").map(toOption),
    packaging: relevantItems.filter((i: { category: string }) => i.category === "packaging").map(toOption),
  };
}

/**
 * Validate a full customization config against current inventory.
 * Checks ALL components (fillings + covers + cases + etc) can be fulfilled.
 */
export async function validateFullConfig(
  pillowProductId: number,
  fillingLines: FillingLine[],
  componentQuantities: ConfigLine[],
  orderQuantity: number
): Promise<{
  valid: boolean;
  shortages: { item_id: number; name: string; needed: number; available: number }[];
}> {
  const admin = supabaseAdmin();

  // Build a map of all items needed: item_id → total quantity
  const needed = new Map<number, number>();

  // Add filling lines
  for (const fl of fillingLines) {
    needed.set(fl.item_id, (needed.get(fl.item_id) ?? 0) + fl.quantity * orderQuantity);
  }

  // Add custom component quantities
  for (const cl of componentQuantities) {
    needed.set(cl.item_id, (needed.get(cl.item_id) ?? 0) + cl.quantity * orderQuantity);
  }

  // If no explicit non-filling components, add defaults from BOM
  const hasNonFilling = componentQuantities.some(
    (cl) => !["filling"].includes(cl.category)
  );

  if (!hasNonFilling) {
    const { data: bomLines } = await admin
      .from("bom_lines")
      .select("item_id, quantity, items!inner(category)")
      .eq("product_id", pillowProductId);

    for (const bl of bomLines ?? []) {
      const cat = (bl as unknown as { items: { category: string } }).items.category;
      if (cat !== "filling") {
        needed.set(bl.item_id, (needed.get(bl.item_id) ?? 0) + bl.quantity * orderQuantity);
      }
    }
  }

  // Check inventory
  const itemIds = [...needed.keys()];
  const { data: balances } = await admin
    .from("inventory_balances")
    .select("item_id, on_hand")
    .in("item_id", itemIds);

  const stockMap = new Map<number, number>(
    (balances ?? []).map((b: { item_id: number; on_hand: number }) => [b.item_id, b.on_hand])
  );

  // Get item names for shortage reporting
  const { data: items } = await admin
    .from("items")
    .select("id, name, subtype")
    .in("id", itemIds);

  const nameMap = new Map<number, string>(
    (items ?? []).map((i: { id: number; name: string; subtype: string | null }) => [
      i.id,
      i.subtype ? `${i.name} (${i.subtype})` : i.name,
    ])
  );

  const shortages: { item_id: number; name: string; needed: number; available: number }[] = [];

  for (const [itemId, qty] of needed) {
    const available = stockMap.get(itemId) ?? 0;
    if (available < qty) {
      shortages.push({
        item_id: itemId,
        name: nameMap.get(itemId) ?? `Item #${itemId}`,
        needed: qty,
        available,
      });
    }
  }

  return { valid: shortages.length === 0, shortages };
}

/**
 * Calculate the addon price from component quantity changes vs base BOM.
 */
export function calculateAddonPrice(
  componentQuantities: ConfigLine[],
  baseQuantities: Map<number, number>
): number {
  let total = 0;
  for (const comp of componentQuantities) {
    const baseQty = baseQuantities.get(comp.item_id) ?? 0;
    const extraQty = Math.max(0, comp.quantity - baseQty);
    if (extraQty > 0) {
      total += extraQty * comp.price_delta;
    }
  }
  return total;
}
