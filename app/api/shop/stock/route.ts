import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids")?.trim();
  if (!idsParam) {
    return NextResponse.json({ ok: true, stock: {} });
  }

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
