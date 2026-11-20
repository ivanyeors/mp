import { isValidPhone, normalizePhone } from "@/lib/appointments/phone";

const SIGN_IN_LABEL: Record<string, string> = {
  email: "Email code",
  google: "Google",
};

export function signInMethodLabel(provider: string): string {
  return SIGN_IN_LABEL[provider] ?? provider.charAt(0).toUpperCase() + provider.slice(1);
}

export function describeSignIn(providers: readonly string[] | null | undefined): string | null {
  const labels = (providers ?? []).map(signInMethodLabel);
  if (labels.length === 0) return null;
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

export type EmailStatus =
  | { verified: true; since: string | null }
  | { verified: false; source: "shopify-import" | "checkout" };

export function emailStatus(input: {
  hasAccount: boolean;
  accountLinkedAt: string | null;
  createdByImport: boolean | null | undefined;
}): EmailStatus {
  if (input.hasAccount) return { verified: true, since: input.accountLinkedAt };
  return { verified: false, source: input.createdByImport ? "shopify-import" : "checkout" };
}

export type MobileStatus = "valid" | "invalid" | "missing";

export function mobileStatus(phone: string | null | undefined): MobileStatus {
  if (!phone?.trim()) return "missing";
  return isValidPhone(phone) ? "valid" : "invalid";
}

export function formatPhone(phone: string): string {
  const e164 = normalizePhone(phone);
  if (!e164) return phone.trim();
  if (e164.startsWith("+65") && e164.length === 11) return `+65 ${e164.slice(3, 7)} ${e164.slice(7)}`;
  return e164;
}

export function describeMobile(phone: string | null | undefined): string {
  const status = mobileStatus(phone);
  if (status === "missing") return "No mobile on file";
  if (status === "invalid") return "Not a valid number";
  const e164 = normalizePhone(phone)!;
  if (!(e164.startsWith("+65") && e164.length === 11)) return "Valid overseas number";
  return e164.charAt(3) === "6" ? "Valid Singapore landline" : "Valid Singapore mobile";
}

export type SeenNumberSource = "booking" | "result";

export interface OtherNumber {
  phone: string;
  sources: SeenNumberSource[];
  lastSeenAt: string;
}

export interface ContactFacts {
  phone: string | null;
  whatsapp: {
    messagedAt: string | null;
    failedAt: string | null;
  };
  otherNumbers: OtherNumber[] | null;
}

export type ContactFactsResult = { ok: true; facts: ContactFacts } | { ok: false };

export function factsAreFor(facts: Pick<ContactFacts, "phone">, phone: string | null | undefined): boolean {
  const a = phone?.trim() || null;
  const b = facts.phone?.trim() || null;
  return a === b;
}
