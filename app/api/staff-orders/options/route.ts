import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/admin";
import { loadStaffOrderOptions } from "@/lib/staff-orders/options";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/staff-orders/options?customer_id= — what the Create order dialog
 * offers (ADR 0048): products with price and stock, Services at their Costings
 * price, delivery methods, studios and the Customer's saved addresses.
 */
export async function GET(req: Request) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;

  const customerId = new URL(req.url).searchParams.get("customer_id") ?? "";
  if (!UUID.test(customerId)) return NextResponse.json({ error: "customer_id is required" }, { status: 400 });

  try {
    const options = await loadStaffOrderOptions(supabaseAdmin(), customerId);
    return NextResponse.json({ ok: true, ...options });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load what can be sold" },
      { status: 500 },
    );
  }
}
