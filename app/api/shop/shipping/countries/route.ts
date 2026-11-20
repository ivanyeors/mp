import { NextResponse } from "next/server";
import { readShippingMethods } from "@/lib/shop/shipping-methods";
import { deliveryCountries } from "@/lib/shipping/countries";
import { isSelfCollect } from "@/lib/shipping/self-collect";

export const runtime = "nodejs";

export async function GET() {
  try {
    const methods = (await readShippingMethods(false, null)).filter((m) => !isSelfCollect(m));
    return NextResponse.json({ ok: true, countries: deliveryCountries(methods) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load shipping methods" },
      { status: 500 },
    );
  }
}
