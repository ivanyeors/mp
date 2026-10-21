/**
 * The Review request (PRD customer-crm slice 07, ADR 0028 f, k): one message
 * per Customer, ever, 14 days after an Order is delivered, asking for a Google
 * review. This file is the pure part — settings, the timing rule, who is a
 * candidate, and each channel's decision — so the daily job and the Aftercare
 * card decide the same way. The IO is in ./review-request-server.
 *
 * Google's review policy, which nothing here may break (README, sixth hazard):
 *  - everyone eligible is asked the same way. Who is asked depends only on
 *    having bought goods, delivery, timing, the channel switches and whether
 *    they were asked before. Nothing that signals how a customer feels is read:
 *    no return, refund request, rating, linked review or note;
 *  - the "need anything else?" line is unconditional;
 *  - nothing is offered for a review.
 */

import { addDays, sgtDate } from "@/lib/readjustment/eligibility";
import {
  classifyOrderLine,
  NOT_A_PURCHASE,
  purchaseLabel,
  type OrderLineRow,
} from "@/lib/readjustment/purchases";
import type { AftercareWaDecision, AftercareWaSkip } from "@/lib/whatsapp/aftercare-notify";
import type { AftercareEmailDecision, AftercareEmailSkip } from "./channels";

/**
 * The registry id of the email (lib/email/registry.ts), and the template key
 * of both ledgers, `customer_emails` and `customer_whatsapp`. Its `entity_id`
 * is the Customer: once per Customer.
 */
export const REVIEW_REQUEST_TEMPLATE = "aftercare.review_request" as const;

// ─── Settings ────────────────────────────────────────────────────────────────

/** `site_settings` keys, seeded by 20261020124000_customer_review_requests.sql. */
export const REVIEW_REQUEST_SETTING_KEYS = [
  "review_requests_enabled",
  "review_request_days_after",
  "review_request_max_age_days",
  "google_review_url",
] as const;
export type ReviewRequestSettingKey = (typeof REVIEW_REQUEST_SETTING_KEYS)[number];

export type ReviewRequestSettings = {
  enabled: boolean;
  /** Asked on the first run on or after delivery + this many days (SGT). */
  daysAfter: number;
  /** Never asked later than delivery + this many days, so switching on never reaches old Orders. */
  maxAgeDays: number;
  /** Where the redirect sends people. https only. */
  googleReviewUrl: string;
};

export const REVIEW_REQUEST_LIMITS = {
  daysAfter: { min: 1, max: 365 },
  maxAgeDays: { min: 1, max: 730 },
} as const;

/** Off until the owner switches it on; a missing key never starts sending. */
export const DEFAULT_REVIEW_REQUEST_SETTINGS: ReviewRequestSettings = {
  enabled: false,
  daysAfter: 14,
  maxAgeDays: 60,
  googleReviewUrl: "",
};

function intIn(raw: string | undefined, fallback: number, lim: { min: number; max: number }): number {
  const n = raw == null || raw.trim() === "" ? NaN : Number(raw.trim());
  return Number.isInteger(n) && n >= lim.min && n <= lim.max ? n : fallback;
}

/** The stored values, with anything missing or malformed at its default. */
export function parseReviewRequestSettings(stored: Record<string, string | undefined>): ReviewRequestSettings {
  const d = DEFAULT_REVIEW_REQUEST_SETTINGS;
  const daysAfter = intIn(stored.review_request_days_after, d.daysAfter, REVIEW_REQUEST_LIMITS.daysAfter);
  const maxAgeDays = intIn(stored.review_request_max_age_days, d.maxAgeDays, REVIEW_REQUEST_LIMITS.maxAgeDays);
  return {
    enabled: (stored.review_requests_enabled ?? "").trim().toLowerCase() === "true",
    daysAfter,
    // A window can be one day long, never negative.
    maxAgeDays: Math.max(maxAgeDays, daysAfter),
    googleReviewUrl: (stored.google_review_url ?? "").trim(),
  };
}

/** An absolute `https:` URL. The job refuses to send without one. */
export function isUsableReviewUrl(url: string | null | undefined): boolean {
  const raw = url?.trim();
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && Boolean(u.hostname);
  } catch {
    return false;
  }
}

/** Why the settings stop every send, or null when they allow sending. */
export type ReviewRequestBlock = "disabled" | "no_review_url";

export function reviewRequestBlock(settings: ReviewRequestSettings): ReviewRequestBlock | null {
  if (!settings.enabled) return "disabled";
  if (!isUsableReviewUrl(settings.googleReviewUrl)) return "no_review_url";
  return null;
}

// ─── Timing ──────────────────────────────────────────────────────────────────

export type ReviewTiming =
  | { due: true; deliveredOn: string }
  | { due: false; reason: "not_delivered" | "too_early" | "too_old" };

/**
 * The timing rule, in Singapore calendar days: due from delivery +
 * `daysAfter`, through delivery + `maxAgeDays`, both inclusive. An in-store
 * handover sets `delivered_at` at handover, so it is timed the same way.
 */
export function reviewRequestTiming(input: {
  deliveredAt: string | null | undefined;
  now: Date;
  daysAfter: number;
  maxAgeDays: number;
}): ReviewTiming {
  if (!input.deliveredAt || !Number.isFinite(Date.parse(input.deliveredAt))) {
    return { due: false, reason: "not_delivered" };
  }
  const deliveredOn = sgtDate(input.deliveredAt);
  const today = sgtDate(input.now);
  // YYYY-MM-DD compares as a string.
  if (today < addDays(deliveredOn, input.daysAfter)) return { due: false, reason: "too_early" };
  if (today > addDays(deliveredOn, input.maxAgeDays)) return { due: false, reason: "too_old" };
  return { due: true, deliveredOn };
}

/** Midnight in Singapore at the start of `ymd`, as an ISO instant. */
const sgtMidnight = (ymd: string) => new Date(`${ymd}T00:00:00+08:00`).toISOString();

/**
 * The instants `[from, to)` whose SGT day can be due today: the database
 * pre-filter on `delivered_at`. {@link reviewRequestTiming} still decides each
 * row. The same window on `paid_at` finds Orders paid long enough ago to be
 * due, but never marked delivered.
 */
export function dueWindow(input: { now: Date; daysAfter: number; maxAgeDays: number }): { from: string; to: string } {
  const today = sgtDate(input.now);
  return {
    from: sgtMidnight(addDays(today, -input.maxAgeDays)),
    to: sgtMidnight(addDays(today, -input.daysAfter + 1)),
  };
}

// ─── Candidates ──────────────────────────────────────────────────────────────

/**
 * The columns the candidate query reads, and nothing more. It never reads a
 * refund request, a return, a returned quantity, a rating or a note
 * (README, sixth hazard); a test pins this list.
 */
export const REVIEW_ORDER_SELECT =
  "id, order_number, customer_id, email, status, paid_at, delivered_at, order_items!inner(id, kind, quantity, product_title, variant_title, image_url, customization_snapshot, product_variants(option1, price_key, pillow_product_id, products(product_type)))";

/** The line fields the query reads: enough to name the product, nothing about its fate. */
export type ReviewOrderLine = Pick<
  OrderLineRow,
  "id" | "kind" | "quantity" | "product_title" | "variant_title" | "image_url" | "customization_snapshot" | "product_variants"
>;

export type ReviewOrderRow = {
  id: string;
  order_number: string;
  customer_id: string | null;
  email: string | null;
  status: string;
  paid_at: string | null;
  delivered_at: string | null;
  order_items?: ReviewOrderLine[] | null;
};

/** A counted Order: paid, and not one whose money went back (`NOT_A_PURCHASE`). */
export function isCountedOrder(o: Pick<ReviewOrderRow, "paid_at" | "status">): boolean {
  return Boolean(o.paid_at) && !NOT_A_PURCHASE.has(o.status);
}

/** Its goods lines: a Service fee alone is not something to review. */
export function goodsLines(o: Pick<ReviewOrderRow, "order_items">): ReviewOrderLine[] {
  return (o.order_items ?? []).filter((l) => (l.kind ?? "goods") === "goods");
}

export type ReviewCandidate = {
  customerId: string;
  /** The Order the message names: their most recently delivered one that is due. */
  order: ReviewOrderRow;
  /** Its delivery day, YYYY-MM-DD in Singapore. */
  deliveredOn: string;
};

/**
 * Who is due a review request today: one entry per Customer with a counted,
 * delivered Order holding a goods line, inside the timing window, who has not
 * been asked before. Oldest delivery first, so a capped run reaches those
 * nearest the maximum age first.
 */
export function selectReviewRequestCandidates(input: {
  orders: readonly ReviewOrderRow[];
  /** Customers with a `customer_review_requests` row: never asked again. */
  asked: ReadonlySet<string>;
  now: Date;
  settings: Pick<ReviewRequestSettings, "daysAfter" | "maxAgeDays">;
}): { candidates: ReviewCandidate[]; alreadyAsked: number } {
  const best = new Map<string, ReviewCandidate>();
  const alreadyAsked = new Set<string>();
  for (const order of input.orders) {
    const customerId = order.customer_id;
    if (!customerId || !isCountedOrder(order) || goodsLines(order).length === 0) continue;
    const timing = reviewRequestTiming({
      deliveredAt: order.delivered_at,
      now: input.now,
      daysAfter: input.settings.daysAfter,
      maxAgeDays: input.settings.maxAgeDays,
    });
    if (!timing.due) continue;
    if (input.asked.has(customerId)) {
      alreadyAsked.add(customerId);
      continue;
    }
    const prev = best.get(customerId);
    const later =
      !prev ||
      order.delivered_at! > prev.order.delivered_at! ||
      (order.delivered_at === prev.order.delivered_at && order.id > prev.order.id);
    if (later) best.set(customerId, { customerId, order, deliveredOn: timing.deliveredOn });
  }
  const candidates = [...best.values()].sort(
    (a, b) =>
      a.order.delivered_at!.localeCompare(b.order.delivered_at!) || a.customerId.localeCompare(b.customerId),
  );
  return { candidates, alreadyAsked: alreadyAsked.size };
}

/**
 * What the message calls the purchase: "Premium Mpillow", "Premium Mpillow
 * and Mbolster". Sizes are left out: they read badly in a sentence. With no
 * pillow or bolster on the Order, the goods' own titles.
 */
export function reviewProductLabel(
  lines: readonly ReviewOrderLine[],
  pillowById: ReadonlyMap<number, { size: string; kind: string }>,
): string {
  const labels: string[] = [];
  const add = (label: string) => {
    const clean = label.replace(/\s+/g, " ").trim();
    if (clean && !labels.includes(clean)) labels.push(clean);
  };
  for (const line of lines) {
    const c = classifyOrderLine(line, pillowById);
    if (c) add(purchaseLabel({ ...c, size: null, length: null }));
  }
  if (labels.length === 0) for (const line of lines) add(line.product_title);
  if (labels.length === 0) return "Mpillow order";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

// ─── Channels ────────────────────────────────────────────────────────────────

/** WhatsApp's decision, plus the one skip the job decides before asking it. */
export type ReviewWhatsAppDecision = AftercareWaDecision | { send: false; skip: "transport_unconfigured" };
/**
 * Every reason WhatsApp did not carry a request: the decision's, plus the two
 * the send itself can return when a concurrent change wins (slice 13).
 */
export type ReviewWhatsAppSkip = AftercareWaSkip | "transport_unconfigured" | "no_customer" | "duplicate";

export type ReviewChannelPlan = {
  email: AftercareEmailDecision;
  whatsapp: ReviewWhatsAppDecision;
  /** At least one channel will send. Without one, the Customer is skipped and counted. */
  any: boolean;
};

export function planReviewChannels(email: AftercareEmailDecision, whatsapp: ReviewWhatsAppDecision): ReviewChannelPlan {
  return { email, whatsapp, any: email.send || whatsapp.send };
}

// ─── The run's report ────────────────────────────────────────────────────────

export type ReviewRequestReport = {
  /** The settings as the run read them. */
  enabled: boolean;
  /** Set when the settings stopped every send: the run only counted. */
  blocked: ReviewRequestBlock | null;
  /** Customers due today and never asked. */
  candidates: number;
  /** Candidates with at least one channel to send on. */
  reachable: number;
  /** Customers claimed and asked this run. */
  asked: number;
  /** Reachable candidates left for the next run by the per-run cap. */
  deferred: number;
  sent: { email: number; whatsapp: number };
  /** Email failures are retried by a later run, up to 3 attempts; WhatsApp is not. */
  failed: { email: number; whatsapp: number };
  /** Earlier failed emails sent this run. */
  retried: number;
  skipped: {
    /** Due, but neither channel can reach them. */
    no_channel: number;
    /** Paid long enough ago to be due, with goods, and never marked delivered (Orders). */
    not_marked_delivered: number;
    /** Lost the claim to a concurrent run, which asks them instead. */
    already_asked: number;
  };
  /** Per channel, among candidates: why that channel will not carry it. */
  emailSkipped: Partial<Record<AftercareEmailSkip, number>>;
  whatsappSkipped: Partial<Record<ReviewWhatsAppSkip, number>>;
  errors: string[];
};

export function emptyReviewRequestReport(settings: ReviewRequestSettings): ReviewRequestReport {
  return {
    enabled: settings.enabled,
    blocked: reviewRequestBlock(settings),
    candidates: 0,
    reachable: 0,
    asked: 0,
    deferred: 0,
    sent: { email: 0, whatsapp: 0 },
    failed: { email: 0, whatsapp: 0 },
    retried: 0,
    skipped: { no_channel: 0, not_marked_delivered: 0, already_asked: 0 },
    emailSkipped: {},
    whatsappSkipped: {},
    errors: [],
  };
}

export function bump<K extends string>(counts: Partial<Record<K, number>>, key: K): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

// ─── Wording shared by the card ──────────────────────────────────────────────

export const EMAIL_SKIP_LABELS: Record<AftercareEmailSkip, string> = {
  opted_out: "Email switched off",
  no_email: "No email address",
  not_allowed_outside_production: "Not on the test allowlist",
};

export const WHATSAPP_SKIP_LABELS: Record<ReviewWhatsAppSkip, string> = {
  transport_unconfigured: "WhatsApp sender not set up",
  template_unconfigured: "Template not approved yet",
  opted_out: "Not opted in",
  stop_requested: "Asked to stop",
  no_mobile: "No mobile",
  invalid_mobile: "Mobile not valid",
  not_allowed_outside_production: "Not on the test allowlist",
  no_customer: "Customer not found",
  duplicate: "Already sent",
};
