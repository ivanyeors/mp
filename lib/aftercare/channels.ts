/**
 * The email side of an Aftercare message's channel decision (ADR 0027 f, l),
 * shared by every Aftercare message: the review request (CRM slice 07) and the
 * check-up (slice 08). Pure, so the daily job and the Aftercare card decide the
 * same way. The WhatsApp side is `decideAftercareWhatsApp`
 * (lib/whatsapp/aftercare-notify.ts).
 *
 * Email is on unless the Customer switched it off (`aftercare_email`, default
 * true). Outside production it goes only to allowlisted addresses, so a preview
 * deploy or a local run sharing a database can never email a real customer.
 */

export type AftercareEmailSkip = "opted_out" | "no_email" | "not_allowed_outside_production";

export type AftercareEmailDecision = { send: true; to: string } | { send: false; skip: AftercareEmailSkip };

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Whether this deploy is production. Vercel builds previews with
 * `NODE_ENV=production`, so `VERCEL_ENV` decides when it is set
 * (lib/email/preview-guard.ts makes the same point).
 */
export function isProductionDeploy(env: Record<string, string | undefined> = process.env): boolean {
  if (env.VERCEL_ENV) return env.VERCEL_ENV === "production";
  return env.NODE_ENV === "production";
}

/**
 * The non-production allowlist for aftercare email: `AFTERCARE_EMAIL_ALLOWLIST`,
 * comma-separated, matched case-insensitively. Production always allows. An
 * empty list allows nobody — unlike `WHATSAPP_ALLOWLIST`, whose empty list
 * allows all — because a missing allowlist must not mean "email everyone".
 */
export function isAftercareEmailAllowed(
  email: string,
  env: Record<string, string | undefined> = process.env,
): boolean {
  if (isProductionDeploy(env)) return true;
  const allowed = (env.AFTERCARE_EMAIL_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

/** Email's send-or-skip, in this order: the switch, an address, the allowlist. */
export function decideAftercareEmail(input: {
  /** `customers.aftercare_email`. Only an explicit false is off. */
  optedIn: boolean | null | undefined;
  /** Where it would go: the Order's email, else the Customer's. */
  email: string | null | undefined;
  allowed: (email: string) => boolean;
}): AftercareEmailDecision {
  if (input.optedIn === false) return { send: false, skip: "opted_out" };
  const to = input.email?.trim() ?? "";
  if (!EMAIL_SHAPE.test(to)) return { send: false, skip: "no_email" };
  if (!input.allowed(to)) return { send: false, skip: "not_allowed_outside_production" };
  return { send: true, to };
}
