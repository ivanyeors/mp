import { NextResponse } from "next/server";
import { tooManyRequests } from "@/lib/rate-limit";
import { z } from "zod";
import { getPartnerContext, isPartnerActive } from "@/lib/auth/partner";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getEmailTransport } from "@/lib/email";
import { AUTH_EMAIL_COPY, renderBackupEmailOtpEmail } from "@/lib/email/auth";
import { loadEmailCopy } from "@/lib/email/copy-store";
import { getDefaultFromAddress } from "@/lib/email/transport";
import { escapeLikePattern } from "@/lib/auth/customer-identity";
import { generateOtpCode, hashOtp, otpExpiry } from "@/lib/partner-backup-email";

export const runtime = "nodejs";

const bodySchema = z.object({ email: z.string().trim().toLowerCase().email().max(320) });

export async function POST(req: Request) {
  const ctx = await getPartnerContext();
  if (!isPartnerActive(ctx)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const limited = await tooManyRequests([
    { bucket: "partner-backup-email", key: ctx.userId, windowMs: 60 * 60_000, max: 5 },
  ]);
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const email = parsed.data.email;

  if (email === ctx.email) {
    return NextResponse.json({ error: "That's already your sign-in email." }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const pat = escapeLikePattern(email);
  const { data: others } = await admin
    .from("partner_users")
    .select("auth_user_id, email, backup_email, backup_email_verified")
    .or(`email.ilike.${pat},backup_email.ilike.${pat}`);
  const clash = (others ?? []).some(
    (r) =>
      r.auth_user_id !== ctx.userId &&
      ((r.email ?? "").toLowerCase() === email ||
        ((r.backup_email ?? "").toLowerCase() === email && r.backup_email_verified)),
  );
  if (clash) return NextResponse.json({ error: "That email is already in use." }, { status: 409 });

  const code = generateOtpCode();
  const { error } = await admin
    .from("partner_users")
    .update({
      backup_email_pending: email,
      backup_email_otp_hash: hashOtp(code),
      backup_email_otp_expires_at: otpExpiry(),
      backup_email_otp_attempts: 0,
    })
    .eq("auth_user_id", ctx.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  try {
    const copy = await loadEmailCopy(AUTH_EMAIL_COPY.backup_email_otp);
    await getEmailTransport().send({
      to: email,
      from: getDefaultFromAddress(),
      ...renderBackupEmailOtpEmail({ code }, copy),
    });
  } catch (e) {
    return NextResponse.json({ error: `Could not send code: ${(e as Error).message}` }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
