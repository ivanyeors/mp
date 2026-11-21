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

export function isWithinReferralWindow(
  stampedAt: string | null | undefined,
  now: Date,
  days: number = REFERRAL_WINDOW_DAYS,
): boolean {
  if (!stampedAt) return false;
  const stamped = Date.parse(stampedAt);
  if (Number.isNaN(stamped)) return false;
  const age = now.getTime() - stamped;
  return age >= 0 && age <= days * DAY_MS;
}

export function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase();
}

const CODE_RE = /^[A-Z0-9]{6,12}$/;

export function isValidReferralCodeFormat(code: string): boolean {
  return CODE_RE.test(normalizeReferralCode(code));
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateReferralCode(length = 8): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}
