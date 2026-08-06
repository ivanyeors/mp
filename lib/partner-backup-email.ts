import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

// Self-issued backup-email OTP helpers. Pure/deterministic (except code+salt
// generation) so the #83 test slice can lock the identity rules. We do NOT use
// Supabase verifyOtp here — that would switch the session to the backup email's
// auth user. Instead we prove inbox ownership with a code we mint, hash, and
// email ourselves, comparing on return.
//
// Stored hash format is `salt:sha256hex` so verifyOtpCode can recover the salt
// without a separate column. A 6-digit code with a short expiry is low value,
// so a salted SHA-256 is sufficient (no bcrypt).
// ponytail: tests owned by slice #83 — no *.test.ts here per the slice contract.

export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

/** Random 6-digit code, zero-padded. */
export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** ISO timestamp `OTP_TTL_MS` from `now` — the code's expiry. */
export function otpExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + OTP_TTL_MS).toISOString();
}

/** `salt:sha256(salt:code)`. A fresh random salt is used unless one is given. */
export function hashOtp(code: string, salt?: string): string {
  const s = salt ?? randomBytes(12).toString("hex");
  const digest = createHash("sha256").update(`${s}:${code}`).digest("hex");
  return `${s}:${digest}`;
}

export function isOtpExpired(expiresAt: string | null | undefined, now: Date): boolean {
  if (!expiresAt) return true;
  const t = Date.parse(expiresAt);
  return !Number.isFinite(t) || now.getTime() > t;
}

/** True only when `input` matches an un-expired stored hash (constant-time). */
export function verifyOtpCode(
  input: string,
  storedHash: string | null | undefined,
  expiresAt: string | null | undefined,
  now: Date,
): boolean {
  if (!storedHash || isOtpExpired(expiresAt, now)) return false;
  const salt = storedHash.split(":")[0] ?? "";
  const expected = hashOtp(input.trim(), salt);
  const a = Buffer.from(expected);
  const b = Buffer.from(storedHash);
  return a.length === b.length && timingSafeEqual(a, b);
}
