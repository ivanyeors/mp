import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import {
  createProductFromInventoryItem,
  listUnpublishedSellableItems,
} from "@/lib/ecommerce/from-inventory";

export const runtime = "nodejs";

const CreateSchema = z.object({
  item_id: z.number().int().positive(),
});

/** List sellable inventory items not yet published as storefront products. */
export async function GET() {
  const denied = await requireAdmin("products");
  if (denied) return denied;

  try {
    const items = await listUnpublishedSellableItems();
    return NextResponse.json({ ok: true, rows: items });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list sellable items";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/** Create a Costings-derived product from a sellable inventory item. */
export async function POST(req: Request) {
  const denied = await requireAdmin("products");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await createProductFromInventoryItem(parsed.data.item_id);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    product_id: result.productId,
    variant_id: result.variantId,
  });
}
