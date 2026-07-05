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

export function configPathFor(variant: MpConfigVariant): string {
  return variant === "basic" ? "/mp-basic" : "/mp-config";
}

export function isNeckStep(step: MpConfigStep): boolean {
  return NECK_STEPS.has(step);
}
