import { stripLocale } from "@/lib/i18n/routing";

/**
 * **Drop-off reasons** (PRD-crm-retention-loop slice 10, ADR 0007 amendment):
 * what a person tells us stopped them, asked where they leave. Self-reported,
 * so kept apart from a **Drop-off**, which records only where a Visit ended.
 *
 * Pure and client-safe, with no zod: the storefront card mounts on every page,
 * so its lists live here and the request schemas in ./schema.
 */

/** Where we ask. The site asks on configurators and checkout; a Result asks on its decline step. */
export const DROP_OFF_STEPS = ["configurator", "checkout", "quote_decline"] as const;
export type DropOffStep = (typeof DROP_OFF_STEPS)[number];

/** The steps the storefront card asks on; `quote_decline` is recorded by the decline route. */
export const SITE_DROP_OFF_STEPS = ["configurator", "checkout"] as const satisfies readonly DropOffStep[];
export type SiteDropOffStep = (typeof SITE_DROP_OFF_STEPS)[number];

export const DROP_OFF_REASONS = [
  "size_or_feel",
  "try_in_person",
  "price",
  "delivery",
  "not_working",
  "just_looking",
  "changed_mind",
  "other",
] as const;
export type DropOffReason = (typeof DROP_OFF_REASONS)[number];

export const DROP_OFF_REASON_LABEL: Record<DropOffReason, string> = {
  size_or_feel: "Not sure about the size or feel",
  try_in_person: "I want to try it in person first",
  price: "The price",
  delivery: "Delivery cost or time",
  not_working: "Something did not work",
  just_looking: "Just looking for now",
  changed_mind: "I changed my mind about the build",
  other: "Other",
};

/** What each answer points to, so the Analytics card says where to look. */
export const DROP_OFF_REASON_AREA: Record<DropOffReason, string> = {
  size_or_feel: "Sizing guidance and the configurator",
  try_in_person: "The in-store route",
  price: "Pricing and how value is shown",
  delivery: "Shipping",
  not_working: "A bug to fix",
  just_looking: "Interest, not a loss",
  changed_mind: "The build we quoted",
  other: "Read the answers",
};

export const DROP_OFF_STEP_LABEL: Record<DropOffStep, string> = {
  configurator: "Configurator",
  checkout: "Checkout",
  quote_decline: "Declined a quote",
};

/** The answers each step offers, *Other* last. */
export const REASONS_FOR_STEP: Record<DropOffStep, readonly DropOffReason[]> = {
  configurator: ["size_or_feel", "try_in_person", "price", "delivery", "not_working", "just_looking", "other"],
  checkout: ["size_or_feel", "try_in_person", "price", "delivery", "not_working", "just_looking", "other"],
  quote_decline: ["size_or_feel", "try_in_person", "price", "delivery", "not_working", "changed_mind", "other"],
};

/** Answers that take a line of text. */
export const TEXT_REASONS: readonly DropOffReason[] = ["not_working", "other"];
export const DROP_OFF_TEXT_MAX = 500;

/** Once per browser per 30 days, whichever step asked. */
export const ASK_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
/** Only after the visitor has started: this long on the page, and one interaction. */
export const ENGAGED_AFTER_MS = 20_000;
/** Asked after this long with no interaction, on any device. */
export const IDLE_MS = 60_000;

const CONFIGURATOR_PATHS = ["/mp-config", "/mp-basic", "/mbolster-config"];

/** The step a storefront path asks on, or null for every other page. */
export function dropOffStepForPath(pathname: string): SiteDropOffStep | null {
  const base = stripLocale(pathname.split(/[?#]/)[0] ?? "").replace(/\/+$/, "") || "/";
  if (CONFIGURATOR_PATHS.includes(base)) return "configurator";
  if (base === "/shop/checkout") return "checkout";
  return null;
}

/** Whether this browser may be asked now, given when it was last asked. */
export function mayAsk(lastAskedAt: string | null, now: Date): boolean {
  if (!lastAskedAt) return true;
  const at = Date.parse(lastAskedAt);
  if (Number.isNaN(at)) return true;
  return now.getTime() - at >= ASK_COOLDOWN_MS;
}

/** Started: long enough on the page, and at least one tap, click or key. */
export function isEngaged(input: { enteredAt: number; interactions: number; now: number }): boolean {
  return input.interactions >= 1 && input.now - input.enteredAt >= ENGAGED_AFTER_MS;
}

/**
 * How near the top edge the pointer's last position may be. A fast flick to
 * the tabs reports its last position a few pixels inside the window, not at 0.
 */
const EXIT_EDGE_PX = 10;

/** The pointer left through the top of the window, toward the tabs or the address bar. */
export function isExitIntent(event: { clientY: number; relatedTarget: unknown }): boolean {
  return event.relatedTarget == null && event.clientY < EXIT_EDGE_PX;
}

/** Staff editing a Result in the storefront configurator (`?edit=1`, lib/results/staff-edit) are not visitors. */
export function isStaffEdit(search: string): boolean {
  return new URLSearchParams(search).get("edit") === "1";
}

/** A step's answers in a random order, *Other* always last, so position does not lead the answer. */
export function shuffledReasons(step: DropOffStep, random: () => number = Math.random): DropOffReason[] {
  const rest = REASONS_FOR_STEP[step].filter((r) => r !== "other");
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j]!, rest[i]!];
  }
  return [...rest, "other"];
}
