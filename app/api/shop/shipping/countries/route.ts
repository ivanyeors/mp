import { NextResponse } from "next/server";
import { readShippingMethods } from "@/lib/shop/shipping-methods";
import { deliveryCountries } from "@/lib/shipping/countries";
import { isSelfCollect } from "@/lib/shipping/self-collect";

export const runtime = "nodejs";

/**
 * The countries checkout and the delivery checker offer: every country an active
 * shipping method lists. Read from the same `shipping-methods`-tagged cache, so
 * saving a method changes this list too.
 */
export async function GET() {
  try {
    // Self-collect delivers nowhere: its country is where the studio is.
    const methods = (await readShippingMethods(false, null)).filter((m) => !isSelfCollect(m));
    return NextResponse.json({ ok: true, countries: deliveryCountries(methods) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load shipping methods" },
      { status: 500 },
    );
  }
}
