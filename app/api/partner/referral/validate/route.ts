import { NextResponse } from "next/server";
import { validateReferralCode } from "@/lib/referrals";
import { isValidReferralCodeFormat } from "@/lib/referrals/attribution";

export const runtime = "nodejs";

/** Public inline-validation for the referral field + shop checkout. */
export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code")?.trim() ?? "";
  if (!code || !isValidReferralCodeFormat(code)) {
    return NextResponse.json({ valid: false, partnerName: null });
  }
  const result = await validateReferralCode(code);
  // Never leak partnerId on the public endpoint — name is enough for feedback.
  return NextResponse.json({ valid: result.valid, partnerName: result.partnerName });
}
