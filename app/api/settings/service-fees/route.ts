import { NextResponse } from "next/server";

import { requireAnyAdmin } from "@/lib/auth/admin";
import { loadReadjustmentPolicy, loadServicePrices } from "@/lib/pricing/service-prices";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/settings/service-fees — the live service fees and complimentary rule,
 * read-only. Costings → Service fees is where they are edited; the Appointments
 * settings sheet shows them so whoever runs re-adjustments sees what is charged.
 */
export async function GET() {
  const denied = await requireAnyAdmin(["costings", "appointments"]);
  if (denied) return denied;
  try {
    const admin = supabaseAdmin();
    const [services, readjustmentPolicy] = await Promise.all([
      loadServicePrices(admin),
      loadReadjustmentPolicy(admin),
    ]);
    // Prices only: this route serves the Appointments role too, which has no
    // business seeing what a service costs us.
    const prices = Object.fromEntries(
      Object.entries(services).map(([k, v]) => [k, { msrp: v.msrp, currency: v.currency }]),
    );
    return NextResponse.json({ ok: true, services: prices, readjustmentPolicy });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not load service fees" },
      { status: 500 },
    );
  }
}
