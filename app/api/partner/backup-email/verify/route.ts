import { NextResponse } from "next/server";
import { z } from "zod";
import { getPartnerContext } from "@/lib/auth/partner";
import { supabaseAdmin } from "@/lib/supabase/server";
import { verifyOtpCode } from "@/lib/partner-backup-email";

export const runtime = "nodejs";

const bodySchema = z.object({ code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code.") });

/**
 * Confirm the self-issued code. On success promote backup_email_pending ->
 * backup_email, set backup_email_verified = true, and clear the pending fields.
 * Only then does the backup address become a recognised sign-in identity.
 */
export async function POST(req: Request) {
  const ctx = await getPartnerContext();
  if (!ctx || ctx.status !== "approved" || !ctx.partnerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: row } = await admin
    .from("partner_users")
    .select("backup_email_pending, backup_email_otp_hash, backup_email_otp_expires_at")
    .eq("auth_user_id", ctx.userId)
    .maybeSingle();

  if (!row?.backup_email_pending) {
    return NextResponse.json({ error: "No pending backup email. Send a code first." }, { status: 400 });
  }

  const ok = verifyOtpCode(parsed.data.code, row.backup_email_otp_hash, row.backup_email_otp_expires_at, new Date());
  if (!ok) return NextResponse.json({ error: "That code is wrong or expired." }, { status: 400 });

  const { error } = await admin
    .from("partner_users")
    .update({
      backup_email: row.backup_email_pending,
      backup_email_verified: true,
      backup_email_pending: null,
      backup_email_otp_hash: null,
      backup_email_otp_expires_at: null,
    })
    .eq("auth_user_id", ctx.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, backup_email: row.backup_email_pending });
}
