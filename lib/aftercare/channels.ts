export type AftercareEmailSkip = "opted_out" | "no_email" | "not_allowed_outside_production";

export type AftercareEmailDecision = { send: true; to: string } | { send: false; skip: AftercareEmailSkip };

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isProductionDeploy(env: Record<string, string | undefined> = process.env): boolean {
  if (env.VERCEL_ENV) return env.VERCEL_ENV === "production";
  return env.NODE_ENV === "production";
}

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

export function decideAftercareEmail(input: {
  optedIn: boolean | null | undefined;
  email: string | null | undefined;
  allowed: (email: string) => boolean;
}): AftercareEmailDecision {
  if (input.optedIn === false) return { send: false, skip: "opted_out" };
  const to = input.email?.trim() ?? "";
  if (!EMAIL_SHAPE.test(to)) return { send: false, skip: "no_email" };
  if (!input.allowed(to)) return { send: false, skip: "not_allowed_outside_production" };
  return { send: true, to };
}
