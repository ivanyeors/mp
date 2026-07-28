/**
 * Referral attribution — PURE (no server-only imports). This file is a test
 * target for slice #85, so keep it free of DB/`supabaseAdmin` imports.
 *
 * Attribution priority: assist > typed > link. The `link` input must already be
 * windowed by the caller (see {@link isWithinReferralWindow}); a link stamp
 * outside the 30-day window should be passed as null.
 */

export type AttributionSource = "assist" | "typed" | "link" | null;

export function resolveAttribution(input: {
  assistPartnerId?: string | null;
  typedPartnerId?: string | null;
  linkPartnerId?: string | null;
}): { partnerId: string | null; source: AttributionSource } {
  if (input.assistPartnerId) return { partnerId: input.assistPartnerId, source: "assist" };
  if (input.typedPartnerId) return { partnerId: input.typedPartnerId, source: "typed" };
  if (input.linkPartnerId) return { partnerId: input.linkPartnerId, source: "link" };
  return { partnerId: null, source: null };
}

export const REFERRAL_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * True when a link stamp is still attributable. Boundary: exactly `days` old is
 * within; strictly older is expired. null/unparseable → false.
 */
export function isWithinReferralWindow(
  stampedAt: string | null | undefined,
  now: Date,
  days: number = REFERRAL_WINDOW_DAYS,
): boolean {
  if (!stampedAt) return false;
  const stamped = Date.parse(stampedAt);
  if (Number.isNaN(stamped)) return false;
  const age = now.getTime() - stamped;
  return age >= 0 && age <= days * DAY_MS; // reject future stamps (clock skew / forged)
}

export function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase();
}

// 6–12 uppercase alphanumerics. Cheap pre-filter only — the DB lookup is
// authoritative on whether a code actually maps to a partner.
const CODE_RE = /^[A-Z0-9]{6,12}$/;

export function isValidReferralCodeFormat(code: string): boolean {
  return CODE_RE.test(normalizeReferralCode(code));
}

// Crockford-ish alphabet: no 0/O/1/I/L to avoid ambiguity when typed by hand.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Short human-friendly code (default 8 chars). Pure formatting; randomness OK. */
export function generateReferralCode(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}
