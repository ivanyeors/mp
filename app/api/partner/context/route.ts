import { NextResponse } from "next/server";
import { getPartnerContext } from "@/lib/auth/partner";

export const runtime = "nodejs";

/**
 * Public partner-status endpoint for the storefront dock: whether the visitor is
 * a partner and their application status. Always 200 so the client can branch on
 * `isPartner`. Not a guard — the /partner page enforces access.
 */
export async function GET() {
  const ctx = await getPartnerContext();
  if (!ctx) {
    return NextResponse.json({ signedIn: false, isPartner: false, status: null });
  }
  return NextResponse.json({ signedIn: true, isPartner: true, status: ctx.status });
}
