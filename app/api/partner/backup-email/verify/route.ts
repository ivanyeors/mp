import { NextResponse } from "next/server";
import { z } from "zod";
import { getPartnerContext, isPartnerActive } from "@/lib/auth/partner";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyOtpCode } from "@/lib/partner-backup-email";

export const runtime = "nodejs";

// A 6-digit code is 1e6 wide; cap wrong guesses so it can't be brute-forced
// within the 10-minute window. On the Nth miss we burn the pending code.
const MAX_OTP_ATTEMPTS = 5;

const bodySchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.") });

/**
 * Confirm the self-issued code. On success promote backup_email_pending ->
 * backup_email, set backup_email_verified = true, and clear the pending fields.
 * Only then does the backup address become a recognised sign-in identity.
 */
export async function POST(req: Request) {
  const ctx = await getPartnerContext();
  if (!isPartnerActive(ctx)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: row } = await admin
    .from("partner_users")
    .select("backup_email_pending, backup_email_otp_hash, backup_email_otp_expires_at, backup_email_otp_attempts")
    .eq("auth_user_id", ctx.userId)
    .maybeSingle();

  if (!row?.backup_email_pending) {
    return NextResponse.json({ error: "No pending backup email. Send a code first." }, { status: 400 });
  }

  const clearCode = () =>
    admin
      .from("partner_users")
      .update({
        backup_email_pending: null,
        backup_email_otp_hash: null,
        backup_email_otp_expires_at: null,
        backup_email_otp_attempts: 0,
      })
      .eq("auth_user_id", ctx.userId);

  // Every guess takes one of the code's tries before it is checked, with a
  // conditional update, so guesses sent at once cannot share a try.
  const attempts = row.backup_email_otp_attempts ?? 0;
  if (attempts >= MAX_OTP_ATTEMPTS) {
    await clearCode();
    return NextResponse.json({ error: "Too many attempts. Request a new code." }, { status: 429 });
  }
  const { data: taken, error: takeError } = await admin
    .from("partner_users")
    .update({ backup_email_otp_attempts: attempts + 1 })
    .eq("auth_user_id", ctx.userId)
    .eq("backup_email_otp_hash", row.backup_email_otp_hash)
    .eq("backup_email_otp_attempts", attempts)
    .select("auth_user_id");
  if (takeError) return NextResponse.json({ error: "Could not check the code. Try again." }, { status: 500 });
  if (!taken?.length) {
    return NextResponse.json({ error: "That code is wrong or expired." }, { status: 400 });
  }

  const ok = verifyOtpCode(parsed.data.code, row.backup_email_otp_hash, row.backup_email_otp_expires_at, new Date());
  if (!ok) {
    if (attempts + 1 >= MAX_OTP_ATTEMPTS) {
      await clearCode();
      return NextResponse.json({ error: "Too many attempts. Request a new code." }, { status: 429 });
    }
    return NextResponse.json({ error: "That code is wrong or expired." }, { status: 400 });
  }

  const { error } = await admin
    .from("partner_users")
    .update({
      backup_email: row.backup_email_pending,
      backup_email_verified: true,
      backup_email_pending: null,
      backup_email_otp_hash: null,
      backup_email_otp_expires_at: null,
      backup_email_otp_attempts: 0,
    })
    .eq("auth_user_id", ctx.userId)
    .eq("backup_email_otp_hash", row.backup_email_otp_hash);
  if (error) return NextResponse.json({ error: "Could not save the backup email. Try again." }, { status: 500 });

  return NextResponse.json({ ok: true, backup_email: row.backup_email_pending });
}
