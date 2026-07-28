import { NextResponse } from "next/server";
import { z } from "zod";
import { getPartnerContext } from "@/lib/auth/partner";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getEmailTransport } from "@/lib/email";
import { getDefaultFromAddress } from "@/lib/email/transport";
import { escapeLikePattern } from "@/lib/auth/customer-identity";
import { generateOtpCode, hashOtp, otpExpiry } from "@/lib/partner-backup-email";

export const runtime = "nodejs";

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email().max(320) });

/**
 * Start backup-email verification: store a hashed 6-digit code + expiry on the
 * caller's partner_users row and email the code to the backup address. Not yet
 * a valid sign-in identity — only verify sets backup_email_verified.
 */
export async function POST(req: Request) {
  const ctx = await getPartnerContext();
  if (!ctx || ctx.status !== "approved" || !ctx.partnerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const email = parsed.data.email;

  if (email === ctx.email) {
    return NextResponse.json({ error: "That's already your sign-in email." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // Reject an address that already resolves to a different partner — its primary
  // email, or a VERIFIED backup — so a verified backup can't shadow another account.
  const pat = escapeLikePattern(email);
  const { data: others } = await admin
    .from("partner_users")
    .select("email, backup_email, backup_email_verified")
    .or(`email.ilike.${pat},backup_email.ilike.${pat}`)
    .neq("auth_user_id", ctx.userId);
  const clash = (others ?? []).some(
    (r) =>
      (r.email ?? "").toLowerCase() === email ||
      ((r.backup_email ?? "").toLowerCase() === email && r.backup_email_verified),
  );
  if (clash) return NextResponse.json({ error: "That email is already in use." }, { status: 409 });

  const code = generateOtpCode();
  const { error } = await admin
    .from("partner_users")
    .update({
      backup_email_pending: email,
      backup_email_otp_hash: hashOtp(code),
      backup_email_otp_expires_at: otpExpiry(),
    })
    .eq("auth_user_id", ctx.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const text = `Your Mpillow Partner backup-email verification code is ${code}. It expires in 10 minutes.`;
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111;">
    <p>Your Mpillow Partner backup-email verification code is:</p>
    <p style="font-size:28px;font-weight:700;letter-spacing:4px;">${code}</p>
    <p style="color:#666;font-size:13px;">It expires in 10 minutes. If you didn't request this, ignore this email.</p>
  </body></html>`;
  try {
    await getEmailTransport().send({ to: email, from: getDefaultFromAddress(), subject: "Verify your backup email", text, html });
  } catch (e) {
    return NextResponse.json({ error: `Could not send code: ${(e as Error).message}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
