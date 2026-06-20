import { NextResponse } from "next/server";
import { getExchangeRates, refreshExchangeRates } from "@/lib/ecommerce/exchange-rates";

const STALE_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

export async function GET() {
  const data = await getExchangeRates();

  // If rates are stale, trigger a background refresh
  const age = Date.now() - new Date(data.updated_at).getTime();
  if (age > STALE_THRESHOLD_MS) {
    // Fire-and-forget refresh — don't block the response
    refreshExchangeRates().catch(() => {});
  }

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800",
    },
  });
}
