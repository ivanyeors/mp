import { NextResponse } from "next/server";
import { syncAllProducts } from "@/lib/ecommerce/inventory-sync";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

export async function POST() {
  const denied = await requireAdmin("inventory");
  if (denied) return denied;

  try {
    const result = await syncAllProducts();

    return NextResponse.json({
      ok: true,
      data: result,
      message: `Synced: ${result.pillows.created + result.bolsters.created} created, ${result.pillows.updated + result.bolsters.updated} updated`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync products";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
