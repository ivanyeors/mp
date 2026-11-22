import { NextResponse } from "next/server";
import { syncAllProducts } from "@/lib/ecommerce/inventory-sync";
import { requireAnyAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

export async function POST() {
  const denied = await requireAnyAdmin(["products", "inventory"]);
  if (denied) return denied;

  try {
    const result = await syncAllProducts();

    const created = result.pillows.created + result.bolsters.created;
    const updated = result.pillows.updated + result.bolsters.updated;
    const parts = [`${created} created`, `${updated} updated`];
    if (result.items.archived) parts.push(`${result.items.archived} archived`);
    if (result.items.adopted) parts.push(`${result.items.adopted} adopted`);
    if (result.items.legacy) parts.push(`${result.items.legacy} legacy`);

    return NextResponse.json({
      ok: true,
      data: result,
      message: `Synced: ${parts.join(", ")}`,
      stripe_warnings: result.stripeWarnings.length > 0 ? result.stripeWarnings : undefined,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sync products";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
