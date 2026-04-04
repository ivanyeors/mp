import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/shop/products/[id]/stock
 *
 * Returns per-variant stock + BOM breakdown for admin product detail.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const admin = supabaseAdmin();

  // Fetch product with variants
  const { data: product, error } = await admin
    .from("products")
    .select("id, product_type, product_variants(id, title, sku, option1, price, pillow_product_id, item_id, track_inventory, stock_quantity, is_active)")
    .eq("id", id)
    .single();

  if (error || !product) {
    return NextResponse.json({ error: "Product not found" }, { status: 404 });
  }

  const variants = (product.product_variants ?? []) as Array<{
    id: string;
    title: string | null;
    sku: string | null;
    option1: string | null;
    price: number;
    pillow_product_id: number | null;
    item_id: number | null;
    track_inventory: boolean;
    stock_quantity: number;
    is_active: boolean;
  }>;

  // Fetch variant_stock for all variants
  const variantIds = variants.map((v) => v.id);
  const { data: stockRows } = await admin
    .from("variant_stock")
    .select("variant_id, stock_available")
    .in("variant_id", variantIds);

  const stockMap = new Map<string, number>(
    (stockRows ?? []).map((r: { variant_id: string; stock_available: number }) => [r.variant_id, r.stock_available])
  );

  // For pillow variants, fetch BOM lines with item details and stock
  const pillowProductIds = variants
    .filter((v) => v.pillow_product_id)
    .map((v) => v.pillow_product_id!);

  let bomMap = new Map<number, Array<{ item_id: number; name: string; category: string; quantity: number; on_hand: number }>>();

  if (pillowProductIds.length > 0) {
    const { data: bomLines } = await admin
      .from("bom_lines")
      .select("product_id, item_id, quantity, items!inner(name, category)")
      .in("product_id", pillowProductIds);

    // Fetch inventory balances for all BOM items
    const bomItemIds = [...new Set((bomLines ?? []).map((bl: { item_id: number }) => bl.item_id))];

    const { data: balances } = await admin
      .from("inventory_balances")
      .select("item_id, on_hand")
      .in("item_id", bomItemIds);

    const balanceMap = new Map<number, number>(
      (balances ?? []).map((b: { item_id: number; on_hand: number }) => [b.item_id, b.on_hand])
    );

    for (const bl of bomLines ?? []) {
      const line = bl as unknown as {
        product_id: number;
        item_id: number;
        quantity: number;
        items: { name: string; category: string } | { name: string; category: string }[];
      };
      const items = Array.isArray(line.items) ? line.items[0] : line.items;
      if (!bomMap.has(line.product_id)) bomMap.set(line.product_id, []);
      bomMap.get(line.product_id)!.push({
        item_id: line.item_id,
        name: items?.name ?? `Item #${line.item_id}`,
        category: items?.category ?? "",
        quantity: line.quantity,
        on_hand: balanceMap.get(line.item_id) ?? 0,
      });
    }
  }

  // For bolster product, fetch bolster_bom_lines
  if (product.product_type === "bolster") {
    const { data: bolsterBom } = await admin
      .from("bolster_bom_lines")
      .select("variant, item_id, quantity, items!inner(name, category)");

    const bolsterItemIds = [...new Set((bolsterBom ?? []).map((bl: { item_id: number }) => bl.item_id))];
    const { data: balances } = await admin
      .from("inventory_balances")
      .select("item_id, on_hand")
      .in("item_id", bolsterItemIds);

    const balanceMap = new Map<number, number>(
      (balances ?? []).map((b: { item_id: number; on_hand: number }) => [b.item_id, b.on_hand])
    );

    // Group by variant name to match with product variants
    const bolsterBomByVariant = new Map<string, Array<{ item_id: number; name: string; category: string; quantity: number; on_hand: number }>>();
    for (const bl of bolsterBom ?? []) {
      const line = bl as unknown as {
        variant: string;
        item_id: number;
        quantity: number;
        items: { name: string; category: string } | { name: string; category: string }[];
      };
      const items = Array.isArray(line.items) ? line.items[0] : line.items;
      if (!bolsterBomByVariant.has(line.variant)) bolsterBomByVariant.set(line.variant, []);
      bolsterBomByVariant.get(line.variant)!.push({
        item_id: line.item_id,
        name: items?.name ?? `Item #${line.item_id}`,
        category: items?.category ?? "",
        quantity: line.quantity,
        on_hand: balanceMap.get(line.item_id) ?? 0,
      });
    }

    // Assign BOM to variants by matching option1 (variant name) to bolster variant
    bomMap = new Map();
    for (const v of variants) {
      const variantName = v.option1?.toLowerCase();
      if (variantName && bolsterBomByVariant.has(variantName)) {
        // Use a fake numeric key based on variant index
        bomMap.set(variants.indexOf(v), bolsterBomByVariant.get(variantName)!);
      }
    }
  }

  // Build response
  const result = variants.map((v, idx) => ({
    id: v.id,
    title: v.title,
    sku: v.sku,
    option1: v.option1,
    price: v.price,
    is_active: v.is_active,
    stock_available: stockMap.get(v.id) ?? (v.track_inventory ? v.stock_quantity : null),
    bom_lines: v.pillow_product_id
      ? bomMap.get(v.pillow_product_id) ?? []
      : product.product_type === "bolster"
        ? bomMap.get(idx) ?? []
        : [],
  }));

  return NextResponse.json({ ok: true, variants: result });
}
