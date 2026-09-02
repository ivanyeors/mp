import { NextResponse } from "next/server";
import { listAdminProducts } from "@/lib/ecommerce/admin/products";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const result = await listAdminProducts(searchParams);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json(result);
}

export async function POST() {
  const denied = await requireAdmin("products");
  if (denied) return denied;

  // Free-form product creation is retired. Sellable products come from inventory:
  // pillows/bolsters via sync, single items via POST /api/shop/products/from-inventory.
  return NextResponse.json(
    {
      ok: false,
      error: "Free-form product creation is disabled. Use Add from inventory (or Sync from Inventory for pillows/bolsters).",
    },
    { status: 400 },
  );
}
