/** mp-config vs mp-basic wizard variant helpers. */

export type MpConfigStep =
  | "welcome"
  | "what-to-expect"
  | "name"
  | "shoulder-length"
  | "neck-to-back"
  | "head-to-back"
  | "neck-length"
  | "customize"
  | "preview";

export type MpConfigVariant = "full" | "basic";

const FULL_STEPS: MpConfigStep[] = [
  "welcome",
  "what-to-expect",
  "name",
  "shoulder-length",
  "neck-to-back",
  "head-to-back",
  "neck-length",
  "customize",
  "preview",
];

const BASIC_STEPS: MpConfigStep[] = [
  "welcome",
  "what-to-expect",
  "name",
  "shoulder-length",
  "customize",
  "preview",
];

const NECK_STEPS = new Set<MpConfigStep>(["neck-to-back", "head-to-back", "neck-length"]);

export function variantFromPathname(pathname: string): MpConfigVariant {
  return pathname.includes("/mp-basic") ? "basic" : "full";
}

export function stepOrderFor(variant: MpConfigVariant): MpConfigStep[] {
  return variant === "basic" ? BASIC_STEPS : FULL_STEPS;
}

export function sessionKeyFor(variant: MpConfigVariant): string {
  return variant === "basic" ? "mp_basic_response_id" : "mp_config_response_id";
}

/**
 * Where the Result access token lives, scoped per variant exactly like the id.
 * An unscoped key would let /mp-basic and /mp-config clobber each other's token
 * while keeping separate ids — one surface would silently stop being the Owner.
 */
export function tokenKeyFor(variant: MpConfigVariant): string {
  return variant === "basic" ? "mp_basic_response_token" : "mp_config_response_token";
}

/**
 * A Result id the server will accept. The route validates with z.string().uuid(),
 * and the previous `${Date.now()}-${Math.random()}` fallback produced ids it
 * rejected with a 400 the UI swallowed — so on any browser without
 * crypto.randomUUID (it needs a secure context) nothing ever saved.
 */
export function newResponseId(): string {
  const c = typeof crypto !== "undefined" ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(b);
  else for (let i = 0; i < 16; i += 1) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; // version 4
  b[8] = (b[8] & 0x3f) | 0x80; // variant 10xx
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function configPathFor(variant: MpConfigVariant): string {
  return variant === "basic" ? "/mp-basic" : "/mp-config";
}

export function isNeckStep(step: MpConfigStep): boolean {
  return NECK_STEPS.has(step);
}
