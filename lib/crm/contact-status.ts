import { isValidPhone, normalizePhone } from "@/lib/appointments/phone";

/**
 * Contact status (PRD customer-crm slice 11; ADR 0028 (j)): what is known
 * about how to reach a **Customer**, each part derived from a fact and never
 * from a box Staff tick.
 *
 * - *Verified email*: they have an account, and an account is bound by the
 *   email they signed in with (`linkCustomerToAuthUser`).
 * - *Sign-in methods*: `customers.account_providers`, from their identities.
 * - *Valid mobile*: the number on file passes `isValidPhone`. Nothing verifies
 *   a phone by code, so this is never "verified".
 * - *Messaged us on WhatsApp*: resolved on the server from `whatsapp_inbound`
 *   with `phonesMatch` (lib/crm/contact-facts.ts), and handed here as
 *   `ContactFacts`.
 *
 * Client-safe: the Customer page's card and the list's Account column read
 * these. The list's Mobile filter is the same test in SQL
 * (`public.is_valid_phone`, `public.is_blank_phone`).
 */

// ─── Sign-in ─────────────────────────────────────────────────────────────────

const SIGN_IN_LABEL: Record<string, string> = {
  email: "Email code",
  google: "Google",
};

/** One sign-in method as Staff read it: `email` is the emailed code. */
export function signInMethodLabel(provider: string): string {
  return SIGN_IN_LABEL[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

/** *Email code*, *Google*, or *Email code and Google*; null when none is recorded. */
export function describeSignIn(providers: readonly string[] | null | undefined): string | null {
  const labels = (providers ?? []).map(signInMethodLabel);
  if (labels.length === 0) return null;
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

// ─── Email ───────────────────────────────────────────────────────────────────

export type EmailStatus =
  | { verified: true; since: string | null }
  | { verified: false; source: "shopify-import" | "checkout" };

/**
 * Verified once they have signed in with it. Without an account the address
 * was typed at checkout, or came from the Shopify import (a Customer the import
 * created; one it matched had theirs from checkout already).
 */
export function emailStatus(input: {
  hasAccount: boolean;
  accountLinkedAt: string | null;
  createdByImport: boolean | null | undefined;
}): EmailStatus {
  if (input.hasAccount) return { verified: true, since: input.accountLinkedAt };
  return { verified: false, source: input.createdByImport ? "shopify-import" : "checkout" };
}

// ─── Mobile ──────────────────────────────────────────────────────────────────

/**
 * The list's Mobile filter, and the Customer page's Mobile row:
 * *on file* is a number that passes `isValidPhone`, *invalid* one that does
 * not, *missing* none at all. Each Customer is exactly one.
 */
export type MobileStatus = "valid" | "invalid" | "missing";

export function mobileStatus(phone: string | null | undefined): MobileStatus {
  if (!phone?.trim()) return "missing";
  return isValidPhone(phone) ? "valid" : "invalid";
}

/** `+65 8780 5311` for a Singapore number; any other valid number in E.164; else as typed. */
export function formatPhone(phone: string): string {
  const e164 = normalizePhone(phone);
  if (!e164) return phone.trim();
  if (e164.startsWith("+65") && e164.length === 11) return `+65 ${e164.slice(3, 7)} ${e164.slice(7)}`;
  return e164;
}

/** What the Mobile row says about the number on file. */
export function describeMobile(phone: string | null | undefined): string {
  const status = mobileStatus(phone);
  if (status === "missing") return "No mobile on file";
  if (status === "invalid") return "Not a valid number";
  const e164 = normalizePhone(phone)!;
  // normalizePhone lets a well-formed overseas number through as it is, and
  // that may start +65 too: Singapore is exactly +65 and eight digits.
  if (!(e164.startsWith("+65") && e164.length === 11)) return "Valid overseas number";
  return e164.charAt(3) === "6" ? "Valid Singapore landline" : "Valid Singapore mobile";
}

// ─── What the server resolves (lib/crm/contact-facts.ts) ─────────────────────

export type SeenNumberSource = "booking" | "result";

/** A number from their bookings or Results that is not the one on file. */
export interface OtherNumber {
  /** Formatted, as `formatPhone` has it. */
  phone: string;
  /** Where it was seen, most recent first. */
  sources: SeenNumberSource[];
  /** The last time it was given. */
  lastSeenAt: string;
}

export interface ContactFacts {
  /** The number on file these were read for. A different one since needs a reload. */
  phone: string | null;
  whatsapp: {
    /** The latest message from this number, any kind; null for none since 20 Oct 2026. */
    messagedAt: string | null;
    /** Our last WhatsApp to this number failed then, and nothing since says it reaches them. */
    failedAt: string | null;
  };
  /** Numbers from the sources this viewer may see; null when they may see neither. */
  otherNumbers: OtherNumber[] | null;
}

export type ContactFactsResult = { ok: true; facts: ContactFacts } | { ok: false };

/** Whether `facts` were read for the number now on file. */
export function factsAreFor(facts: Pick<ContactFacts, "phone">, phone: string | null | undefined): boolean {
  const a = phone?.trim() || null;
  const b = facts.phone?.trim() || null;
  return a === b;
}
