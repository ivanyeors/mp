import { NextResponse } from "next/server";

import { serviceCopyValues } from "@/lib/pricing/service-copy";
import { loadReadjustmentPolicy, loadServicePrices } from "@/lib/pricing/service-prices";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * GET /api/service-fees — the public face of Costings → Service fees: the three
 * fees and the complimentary window as the website prints them. Prices only,
 * never cost. Lets client-rendered policy copy (the learn-more slide-ins) quote
 * today's numbers rather than ones typed into a translation file.
 */
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
