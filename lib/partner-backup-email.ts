import { createHash, randomBytes, randomInt } from "node:crypto";
import { secretMatches } from "@/lib/auth/secret";

// ponytail: tests owned by slice #83 — no *.test.ts here per the slice contract.

export const OTP_TTL_MS = 10 * 60 * 1000;

export function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function otpExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + OTP_TTL_MS).toISOString();
}

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

export function verifyOtpCode(
  input: string,
  storedHash: string | null | undefined,
  expiresAt: string | null | undefined,
  now: Date,
): boolean {
  if (!storedHash || isOtpExpired(expiresAt, now)) return false;
  const salt = storedHash.split(":")[0] ?? "";
  const expected = hashOtp(input.trim(), salt);
  return secretMatches(storedHash, expected);
}
