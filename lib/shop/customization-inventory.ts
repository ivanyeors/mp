import { supabaseAdmin } from "@/lib/supabase/server";
import {
  composedBuildLines,
  type CategorisedLine,
  type ComposedSellableRef,
} from "@/lib/ecommerce/inventory-deduction";
import type { BolsterVariant, ComponentOption, ConfigLine, CustomizationProductType, FillingLine } from "@/lib/types/customization";
import type { ItemOverlay, OverlayFit } from "@/lib/product-builder/overlays";

export async function fetchOverlayMap(
  admin: ReturnType<typeof supabaseAdmin>,
  itemIds: number[],
): Promise<Map<number, ItemOverlay>> {
  const map = new Map<number, ItemOverlay>();
  if (itemIds.length === 0) return map;
  const { data } = await admin
    .from("item_overlay_mappings")
    .select("item_id, fit, color, media_assets ( hosted_url )")
    .in("item_id", itemIds);
  for (const row of (data ?? []) as Array<{
    item_id: number;
    fit: OverlayFit | null;
    color: string | null;
    media_assets: { hosted_url: string | null } | { hosted_url: string | null }[] | null;
  }>) {
    const asset = Array.isArray(row.media_assets) ? row.media_assets[0] : row.media_assets;
    if (row.color) map.set(row.item_id, { color: row.color });
    else if (asset?.hosted_url) map.set(row.item_id, { url: asset.hosted_url, fit: row.fit ?? null });
  }
  return map;
}

export function toComponentRole(category: string): string {
  if (category === "pillow_case" || category === "bolster_case" || category === "case") return "case";
  if (category === "pillow_protector" || category === "bolster_protector" || category === "protector") {
    return "protector";
  }
  return category;
}

export function isCaseInventoryCategory(category: string): boolean {
  return category === "case" || category === "pillow_case" || category === "bolster_case";
}

export function isProtectorInventoryCategory(category: string): boolean {
  return (
    category === "protector" ||
    category === "pillow_protector" ||
    category === "bolster_protector"
  );
}

const BOLSTER_CASE_SIZE: Record<BolsterVariant, string> = { short: "S", medium: "M", long: "L" };

export function isBolsterCaseForLength(
  item: { category: string; size: string | null },
  length: BolsterVariant,
): boolean {
  return (
    item.category === "bolster_case" &&
    item.size?.trim().toUpperCase() === BOLSTER_CASE_SIZE[length]
  );
}

export function itemMatchesPreferenceRole(
  itemCategory: string,
  preferenceRole: "cover" | "case",
): boolean {
  if (preferenceRole === "cover") return itemCategory === "cover";
  return isCaseInventoryCategory(itemCategory);
}

const PILLOW_COMPONENT_CATEGORIES = [
  "cover",
  "pillow_case",
  "pillow_protector",
  "packaging",
  "case",
  "protector",
] as const;

const BOLSTER_COMPONENT_CATEGORIES = [
  "cover",
  "bolster_case",
  "bolster_protector",
  "packaging",
  "case",
  "protector",
] as const;

export async function getAvailableComponents(pillowProductId: number): Promise<{
  covers: ComponentOption[];
  cases: ComponentOption[];
  protectors: ComponentOption[];
  packaging: ComponentOption[];
}> {
  const admin = supabaseAdmin();

  const { data: pillowProduct } = await admin
    .from("pillow_products")
    .select("id, size, kind")
    .eq("id", pillowProductId)
    .single();

  if (!pillowProduct) {
    return { covers: [], cases: [], protectors: [], packaging: [] };
  }

  const { data: bomLines } = await admin
    .from("bom_lines")
    .select("item_id, quantity")
    .eq("product_id", pillowProductId);

  const bomMap = new Map<number, number>(
    (bomLines ?? []).map((bl: { item_id: number; quantity: number }) => [bl.item_id, bl.quantity])
  );

  const { data: items } = await admin
    .from("items")
    .select("id, category, subtype, name, size")
    .eq("is_active", true)
    .in("category", [...PILLOW_COMPONENT_CATEGORIES]);

  if (!items) return { covers: [], cases: [], protectors: [], packaging: [] };

  const pillowSize = pillowProduct.size;
  const packagingSize = ["XS", "S", "M"].includes(pillowSize) ? "S" : "L";

  const relevantItems = items.filter((i: { category: string; size: string | null }) => {
    if (i.category === "packaging") {
      return i.size === packagingSize;
    }
    return i.size === pillowSize || i.size === null;
  });

  const itemIds = relevantItems.map((i: { id: number }) => i.id);
  const { data: balances } = await admin
    .from("inventory_balances")
    .select("item_id, on_hand")
    .in("item_id", itemIds);

  const stockMap = new Map<number, number>(
    (balances ?? []).map((b: { item_id: number; on_hand: number }) => [b.item_id, b.on_hand])
  );

  const { data: prices } = await admin
    .from("item_prices")
    .select("item_id, msrp")
    .in("item_id", itemIds);

  const priceMap = new Map<number, number>(
    (prices ?? []).map((p: { item_id: number; msrp: number | null }) => [p.item_id, p.msrp ?? 0])
  );

  const overlayMap = await fetchOverlayMap(admin, itemIds);

  const toOption = (i: {
    id: number;
    category: string;
    subtype: string | null;
    name: string;
    size: string | null;
  }): ComponentOption => ({
    item_id: i.id,
    category: toComponentRole(i.category),
    name: i.name,
    subtype: i.subtype ?? undefined,
    size: i.size ?? undefined,
    stock_available: stockMap.get(i.id) ?? 0,
    unit_price: priceMap.get(i.id) ?? 0,
    base_quantity: bomMap.get(i.id) ?? 0,
    overlay: overlayMap.get(i.id) ?? null,
  });

  return {
    covers: relevantItems.filter((i: { category: string }) => i.category === "cover").map(toOption),
    cases: relevantItems.filter((i: { category: string }) => isCaseInventoryCategory(i.category)).map(toOption),
    protectors: relevantItems
      .filter((i: { category: string }) => isProtectorInventoryCategory(i.category))
      .map(toOption),
    packaging: relevantItems.filter((i: { category: string }) => i.category === "packaging").map(toOption),
  };
}

export async function getAvailableBolsterComponents(bolsterProductId: number): Promise<{
  covers: ComponentOption[];
  cases: ComponentOption[];
  protectors: ComponentOption[];
  packaging: ComponentOption[];
}> {
  const admin = supabaseAdmin();

  const { data: bolsterProduct } = await admin
    .from("bolster_products")
    .select("id, size")
    .eq("id", bolsterProductId)
    .single();

  if (!bolsterProduct) {
    return { covers: [], cases: [], protectors: [], packaging: [] };
  }

  const { data: bomLines } = await admin
    .from("bom_lines")
    .select("item_id, quantity")
    .eq("product_id", bolsterProductId);

  const bomMap = new Map<number, number>(
    (bomLines ?? []).map((bl: { item_id: number; quantity: number }) => [bl.item_id, bl.quantity])
  );

  const { data: items } = await admin
    .from("items")
    .select("id, category, subtype, name, size")
    .eq("is_active", true)
    .in("category", [...BOLSTER_COMPONENT_CATEGORIES]);

  if (!items) return { covers: [], cases: [], protectors: [], packaging: [] };

  const bolsterSize = bolsterProduct.size;
  const relevantItems = items.filter((i: { category: string; size: string | null }) => {
    const size = i.size?.toUpperCase() ?? null;
    return (
      i.size === bolsterSize ||
      size === "BOLSTER" ||
      i.size === null
    );
  });

  const itemIds = relevantItems.map((i: { id: number }) => i.id);
  if (itemIds.length === 0) return { covers: [], cases: [], protectors: [], packaging: [] };

  const { data: balances } = await admin
    .from("inventory_balances")
    .select("item_id, on_hand")
    .in("item_id", itemIds);

  const stockMap = new Map<number, number>(
    (balances ?? []).map((b: { item_id: number; on_hand: number }) => [b.item_id, b.on_hand])
  );

  const { data: prices } = await admin
    .from("item_prices")
    .select("item_id, msrp")
    .in("item_id", itemIds);

  const priceMap = new Map<number, number>(
    (prices ?? []).map((p: { item_id: number; msrp: number | null }) => [p.item_id, p.msrp ?? 0])
  );

  const overlayMap = await fetchOverlayMap(admin, itemIds);

  const toOption = (i: {
    id: number;
    category: string;
    subtype: string | null;
    name: string;
    size: string | null;
  }): ComponentOption => ({
    item_id: i.id,
    category: toComponentRole(i.category),
    name: i.name,
    subtype: i.subtype ?? undefined,
    size: i.size ?? undefined,
    stock_available: stockMap.get(i.id) ?? 0,
    unit_price: priceMap.get(i.id) ?? 0,
    base_quantity: bomMap.get(i.id) ?? 0,
    overlay: overlayMap.get(i.id) ?? null,
  });

  return {
    covers: relevantItems.filter((i: { category: string }) => i.category === "cover").map(toOption),
    cases: relevantItems.filter((i: { category: string }) => isCaseInventoryCategory(i.category)).map(toOption),
    protectors: relevantItems
      .filter((i: { category: string }) => isProtectorInventoryCategory(i.category))
      .map(toOption),
    packaging: relevantItems.filter((i: { category: string }) => i.category === "packaging").map(toOption),
  };
}

type ConfigValidation = {
  valid: boolean;
  shortages: { item_id: number; name: string; needed: number; available: number }[];
  needed: Map<number, number>;
};

async function validateComposedBuild(
  sellable: ComposedSellableRef,
  chosen: CategorisedLine[],
  orderQuantity: number,
  reserved: ReadonlyMap<number, number>,
): Promise<ConfigValidation> {
  const admin = supabaseAdmin();

  const needed = new Map<number, number>();
  for (const line of await composedBuildLines(admin, sellable, chosen)) {
    needed.set(line.item_id, (needed.get(line.item_id) ?? 0) + line.quantity * orderQuantity);
  }

  const itemIds = [...needed.keys()];
  if (itemIds.length === 0) {
    return { valid: true, shortages: [], needed };
  }

  const { data: balances } = await admin
    .from("inventory_balances")
    .select("item_id, on_hand")
    .in("item_id", itemIds);

  const stockMap = new Map<number, number>(
    (balances ?? []).map((b: { item_id: number; on_hand: number }) => [b.item_id, b.on_hand])
  );

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
    const total = qty + (reserved.get(itemId) ?? 0);
    if (available < total) {
      shortages.push({
        item_id: itemId,
        name: nameMap.get(itemId) ?? `Item #${itemId}`,
        needed: total,
        available,
      });
    }
  }

  return { valid: shortages.length === 0, shortages, needed };
}

export async function validateFullConfig(
  pillowProductId: number,
  fillingLines: FillingLine[],
  componentQuantities: ConfigLine[],
  orderQuantity: number,
  reserved: ReadonlyMap<number, number> = new Map()
): Promise<ConfigValidation> {
  return validateComposedBuild(
    { pillowProductId },
    [
      ...componentQuantities.map((cl) => ({ item_id: cl.item_id, quantity: cl.quantity, category: cl.category })),
      ...fillingLines.map((fl) => ({ item_id: fl.item_id, quantity: fl.quantity, category: "filling" })),
    ],
    orderQuantity,
    reserved,
  );
}

export async function getBolsterBaseQuantities(
  bolsterVariant: BolsterVariant
): Promise<Map<number, number>> {
  const admin = supabaseAdmin();

  const { data: bomLines } = await admin
    .from("bolster_bom_lines")
    .select("item_id, quantity")
    .eq("variant", bolsterVariant);

  return new Map<number, number>(
    (bomLines ?? []).map((bl: { item_id: number; quantity: number }) => [bl.item_id, bl.quantity])
  );
}

export async function validateBolsterConfig(
  bolsterVariant: BolsterVariant,
  componentQuantities: ConfigLine[],
  orderQuantity: number,
  reserved: ReadonlyMap<number, number> = new Map()
): Promise<ConfigValidation> {
  return validateComposedBuild(
    { length: bolsterVariant },
    componentQuantities.map((cl) => ({ item_id: cl.item_id, quantity: cl.quantity, category: cl.category })),
    orderQuantity,
    reserved,
  );
}

export async function validateCustomizationConfig(params: {
  product_type: CustomizationProductType;
  pillow_product_id?: number;
  bolster_variant?: BolsterVariant;
  filling_lines: FillingLine[];
  component_quantities: ConfigLine[];
  orderQuantity: number;
  reserved?: ReadonlyMap<number, number>;
}): Promise<ConfigValidation> {
  if (params.product_type === "bolster") {
    if (!params.bolster_variant) {
      return {
        valid: false,
        shortages: [{
          item_id: 0,
          name: "Missing bolster_variant",
          needed: 0,
          available: 0,
        }],
        needed: new Map(),
      };
    }
    return validateBolsterConfig(
      params.bolster_variant,
      params.component_quantities,
      params.orderQuantity,
      params.reserved
    );
  }

  if (!params.pillow_product_id) {
    return {
      valid: false,
      shortages: [{
        item_id: 0,
        name: "Missing pillow_product_id",
        needed: 0,
        available: 0,
      }],
      needed: new Map(),
    };
  }

  return validateFullConfig(
    params.pillow_product_id,
    params.filling_lines,
    params.component_quantities,
    params.orderQuantity,
    params.reserved
  );
}
