import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendChatCodeEmail } from "@/lib/email/support-chat";
import { OTP_TTL_MS, generateOtpCode, hashOtp, isOtpExpired, otpExpiry, verifyOtpCode } from "@/lib/partner-backup-email";

export const CHAT_CODE_MAX_ATTEMPTS = 5;
export const CHAT_CODES_PER_EMAIL = 3;
const PER_EMAIL_WINDOW_MS = 10 * 60_000;
const KEEP_CODES_MS = 24 * 60 * 60_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type CodeRow = {
  id: string;
  email: string;
  code_hash: string;
  attempts: number;
  expires_at: string;
  used_at: string | null;
  created_at: string;
};

export type IssueCodeResult = { ok: true; codeId: string; email: string } | { ok: false; reason: "too_many" | "send_failed" };

export async function issueChatCode(rawEmail: string, now: Date = new Date()): Promise<IssueCodeResult> {
  const admin = supabaseAdmin();
  const email = rawEmail.trim().toLowerCase();

  const { error: sweepError } = await admin
    .from("support_chat_codes")
    .delete()
    .lt("created_at", new Date(now.getTime() - KEEP_CODES_MS).toISOString());
  if (sweepError) console.error("[support/chat] sweeping old codes failed:", sweepError.message);

  const { count, error: countError } = await admin
    .from("support_chat_codes")
    .select("id", { count: "exact", head: true })
    .eq("email", email)
    .gte("created_at", new Date(now.getTime() - PER_EMAIL_WINDOW_MS).toISOString());
  if (countError) throw new Error(`support chat code count failed: ${countError.message}`);
  if ((count ?? 0) >= CHAT_CODES_PER_EMAIL) return { ok: false, reason: "too_many" };

  const code = generateOtpCode();
  const id = randomUUID();
  const { error } = await admin.from("support_chat_codes").insert({
    id,
    email,
    code_hash: hashOtp(code),
    attempts: 0,
    expires_at: otpExpiry(now),
    used_at: null,
    created_at: now.toISOString(),
  });
  if (error) throw new Error(`support chat code insert failed: ${error.message}`);

  try {
    await sendChatCodeEmail(email, code, OTP_TTL_MS / 60_000);
  } catch (err) {
    console.error("[support/chat] code email failed:", err instanceof Error ? err.message : err);
    await admin.from("support_chat_codes").delete().eq("id", id);
    return { ok: false, reason: "send_failed" };
  }
  return { ok: true, codeId: id, email };
}

export type RedeemCodeResult =
  | { ok: true; email: string }
  | { ok: false; reason: "wrong"; attemptsLeft: number }
  | { ok: false; reason: "expired" | "too_many_tries" };

export async function redeemChatCode(codeId: string, code: string, now: Date = new Date()): Promise<RedeemCodeResult> {
  if (!UUID.test(codeId)) return { ok: false, reason: "expired" };
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("support_chat_codes")
    .select("id,email,code_hash,attempts,expires_at,used_at,created_at")
    .eq("id", codeId)
    .maybeSingle();
  if (error) throw new Error(`support chat code read failed: ${error.message}`);
  const row = data as CodeRow | null;
  if (!row || row.used_at || isOtpExpired(row.expires_at, now)) return { ok: false, reason: "expired" };

  let attempts = row.attempts;
  for (let round = 0; ; round++) {
    if (attempts >= CHAT_CODE_MAX_ATTEMPTS || round === 5) return { ok: false, reason: "too_many_tries" };
    const { data: taken, error: takeError } = await admin
      .from("support_chat_codes")
      .update({ attempts: attempts + 1 })
      .eq("id", row.id)
      .eq("attempts", attempts)
      .select("id");
    if (takeError) throw new Error(`support chat code update failed: ${takeError.message}`);
    if (taken?.length) {
      attempts += 1;
      break;
    }
    const { data: fresh } = await admin.from("support_chat_codes").select("attempts").eq("id", row.id).maybeSingle();
    if (!fresh) return { ok: false, reason: "expired" };
    attempts = (fresh as { attempts: number }).attempts;
  }

  if (!verifyOtpCode(code, row.code_hash, row.expires_at, now)) {
    const attemptsLeft = CHAT_CODE_MAX_ATTEMPTS - attempts;
    return attemptsLeft > 0 ? { ok: false, reason: "wrong", attemptsLeft } : { ok: false, reason: "too_many_tries" };
  }

  const { data: used, error: useError } = await admin
    .from("support_chat_codes")
    .update({ used_at: now.toISOString() })
    .eq("id", row.id)
    .is("used_at", null)
    .select("id");
  if (useError) throw new Error(`support chat code update failed: ${useError.message}`);
  if (!used?.length) return { ok: false, reason: "expired" };
  return { ok: true, email: row.email };
}
