import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/shop/stock?ids=<uuid>,<uuid>,...
 *
 * Public batch availability lookup from the variant_stock view. Used by the cart
 * to cap quantities and surface shortages before checkout. Checkout server
 * validation remains the final authority.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids")?.trim();
  if (!idsParam) {
    return NextResponse.json({ ok: true, stock: {} });
  }

  // Only accept well-formed UUIDs; ignore anything else so a malformed id never
  // breaks the whole lookup.
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const ids = [...new Set(idsParam.split(","))]
    .map((s) => s.trim())
    .filter((s) => uuidRe.test(s));

  if (ids.length === 0) {
    return NextResponse.json({ ok: true, stock: {} });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("variant_stock")
    .select("variant_id, stock_available")
    .in("variant_id", ids);

  if (error) {
    return NextResponse.json({ error: "Failed to load stock" }, { status: 500 });
  }

  const stock: Record<string, number> = {};
  for (const row of (data ?? []) as { variant_id: string; stock_available: number }[]) {
    stock[row.variant_id] = row.stock_available;
  }

  return NextResponse.json({ ok: true, stock });
}
