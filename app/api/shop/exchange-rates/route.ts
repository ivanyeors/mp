import { NextResponse } from "next/server";
import { getExchangeRates, refreshExchangeRates } from "@/lib/ecommerce/exchange-rates";

const STALE_THRESHOLD_MS = 60 * 60 * 1000;

export async function GET() {
  const data = await getExchangeRates();

  const age = Date.now() - new Date(data.updated_at).getTime();
  if (age > STALE_THRESHOLD_MS) {
    refreshExchangeRates().catch(() => {});
  }

  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800",
    },
  });
}
