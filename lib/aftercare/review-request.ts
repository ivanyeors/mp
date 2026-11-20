import { addDays, sgtDate } from "@/lib/readjustment/eligibility";
import {
  classifyOrderLine,
  NOT_A_PURCHASE,
  purchaseLabel,
  type OrderLineRow,
} from "@/lib/readjustment/purchases";
import type { AftercareWaDecision, AftercareWaSkip } from "@/lib/whatsapp/aftercare-notify";
import type { AftercareEmailDecision, AftercareEmailSkip } from "./channels";

export const REVIEW_REQUEST_TEMPLATE = "aftercare.review_request" as const;

export const REVIEW_REQUEST_SETTING_KEYS = [
  "review_requests_enabled",
  "review_request_days_after",
  "review_request_max_age_days",
  "google_review_url",
] as const;
export type ReviewRequestSettingKey = (typeof REVIEW_REQUEST_SETTING_KEYS)[number];

export type ReviewRequestSettings = {
  enabled: boolean;
  daysAfter: number;
  maxAgeDays: number;
  googleReviewUrl: string;
};

export const REVIEW_REQUEST_LIMITS = {
  daysAfter: { min: 1, max: 365 },
  maxAgeDays: { min: 1, max: 730 },
} as const;

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

export function parseReviewRequestSettings(stored: Record<string, string | undefined>): ReviewRequestSettings {
  const d = DEFAULT_REVIEW_REQUEST_SETTINGS;
  const daysAfter = intIn(stored.review_request_days_after, d.daysAfter, REVIEW_REQUEST_LIMITS.daysAfter);
  const maxAgeDays = intIn(stored.review_request_max_age_days, d.maxAgeDays, REVIEW_REQUEST_LIMITS.maxAgeDays);
  return {
    enabled: (stored.review_requests_enabled ?? "").trim().toLowerCase() === "true",
    daysAfter,
    maxAgeDays: Math.max(maxAgeDays, daysAfter),
    googleReviewUrl: (stored.google_review_url ?? "").trim(),
  };
}

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

export type ReviewRequestBlock = "disabled" | "no_review_url";

export function reviewRequestBlock(settings: ReviewRequestSettings): ReviewRequestBlock | null {
  if (!settings.enabled) return "disabled";
  if (!isUsableReviewUrl(settings.googleReviewUrl)) return "no_review_url";
  return null;
}

export type ReviewTiming =
  | { due: true; deliveredOn: string }
  | { due: false; reason: "not_delivered" | "too_early" | "too_old" };

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
  if (today < addDays(deliveredOn, input.daysAfter)) return { due: false, reason: "too_early" };
  if (today > addDays(deliveredOn, input.maxAgeDays)) return { due: false, reason: "too_old" };
  return { due: true, deliveredOn };
}

const sgtMidnight = (ymd: string) => new Date(`${ymd}T00:00:00+08:00`).toISOString();

export function dueWindow(input: { now: Date; daysAfter: number; maxAgeDays: number }): { from: string; to: string } {
  const today = sgtDate(input.now);
  return {
    from: sgtMidnight(addDays(today, -input.maxAgeDays)),
    to: sgtMidnight(addDays(today, -input.daysAfter + 1)),
  };
}

export const REVIEW_ORDER_SELECT =
  "id, order_number, customer_id, email, status, paid_at, delivered_at, order_items!inner(id, kind, quantity, product_title, variant_title, image_url, customization_snapshot, product_variants(option1, price_key, pillow_product_id, products(product_type)))";

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

export function isCountedOrder(o: Pick<ReviewOrderRow, "paid_at" | "status">): boolean {
  return Boolean(o.paid_at) && !NOT_A_PURCHASE.has(o.status);
}

export function goodsLines(o: Pick<ReviewOrderRow, "order_items">): ReviewOrderLine[] {
  return (o.order_items ?? []).filter((l) => (l.kind ?? "goods") === "goods");
}

export type ReviewCandidate = {
  customerId: string;
  order: ReviewOrderRow;
  deliveredOn: string;
};

export function selectReviewRequestCandidates(input: {
  orders: readonly ReviewOrderRow[];
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

export type ReviewWhatsAppDecision = AftercareWaDecision | { send: false; skip: "transport_unconfigured" };
export type ReviewWhatsAppSkip = AftercareWaSkip | "transport_unconfigured" | "no_customer" | "duplicate";

export type ReviewChannelPlan = {
  email: AftercareEmailDecision;
  whatsapp: ReviewWhatsAppDecision;
  any: boolean;
};

export function planReviewChannels(email: AftercareEmailDecision, whatsapp: ReviewWhatsAppDecision): ReviewChannelPlan {
  return { email, whatsapp, any: email.send || whatsapp.send };
}

export type ReviewRequestReport = {
  enabled: boolean;
  blocked: ReviewRequestBlock | null;
  candidates: number;
  reachable: number;
  asked: number;
  deferred: number;
  sent: { email: number; whatsapp: number };
  failed: { email: number; whatsapp: number };
  retried: number;
  skipped: {
    no_channel: number;
    not_marked_delivered: number;
    already_asked: number;
  };
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
