import { NextResponse } from "next/server";

import { serviceCopyValues } from "@/lib/pricing/service-copy";
import { loadReadjustmentPolicy, loadServicePrices } from "@/lib/pricing/service-prices";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  try {
    const admin = supabaseAdmin();
    const [prices, policy] = await Promise.all([loadServicePrices(admin), loadReadjustmentPolicy(admin)]);
    return NextResponse.json(
      { ok: true, copy: serviceCopyValues(prices, policy) },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Service fees unavailable" },
      { status: 503 },
    );
  }
}
