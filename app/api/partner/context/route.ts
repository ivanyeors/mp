import { NextResponse } from "next/server";
import { getPartnerContext } from "@/lib/auth/partner";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await getPartnerContext();
  if (!ctx) {
    return NextResponse.json({ signedIn: false, isPartner: false, status: null });
  }
  return NextResponse.json({ signedIn: true, isPartner: true, status: ctx.status });
}
