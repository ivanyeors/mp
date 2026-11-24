import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/admin";
import { loadBuildOptions } from "@/lib/staff-orders/builds";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;

  const variantId = new URL(req.url).searchParams.get("variant_id") ?? "";
  if (!UUID.test(variantId)) return NextResponse.json({ error: "variant_id is required" }, { status: 400 });

  try {
    const loaded = await loadBuildOptions(supabaseAdmin(), variantId);
    if (!loaded.ok) return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    return NextResponse.json({ ok: true, ...loaded.options });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load the Filling Templates" },
      { status: 500 },
    );
  }
}
