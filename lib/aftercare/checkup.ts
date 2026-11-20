import { addDays, sgtDate } from "@/lib/readjustment/eligibility";
import { NOT_A_PURCHASE, purchaseLabel } from "@/lib/readjustment/purchases";
import type { ServicePrice } from "@/lib/pricing/service-prices";
import { decideAftercareEmail, type AftercareEmailDecision, type AftercareEmailSkip } from "./channels";
import {
  EMAIL_SKIP_LABELS,
  WHATSAPP_SKIP_LABELS,
  type ReviewWhatsAppDecision,
  type ReviewWhatsAppSkip,
} from "./review-request";

export const CHECKUP_EMAIL_ID = "aftercare.checkup" as const;

export const CHECKUP_TEMPLATE_PREFIX = "aftercare.checkup_" as const;

export const CHECKUP_TEMPLATE_LIKE = `${CHECKUP_TEMPLATE_PREFIX}%`;

export type CheckupTemplate = `aftercare.checkup_${number}m`;

export function checkupTemplate(milestoneMonths: number): CheckupTemplate {
  return `${CHECKUP_TEMPLATE_PREFIX}${milestoneMonths}m`;
}

export function milestoneOfTemplate(template: string): number | null {
  const m = /^aftercare\.checkup_(\d+)m$/.exec(template);
  return m ? Number(m[1]) : null;
}

export const CHECKUP_SETTING_KEYS = ["checkup_reminders_enabled", "checkup_months"] as const;
export type CheckupSettingKey = (typeof CHECKUP_SETTING_KEYS)[number];

export type CheckupSettings = {
  enabled: boolean;
  months: number;
};

export const CHECKUP_LIMITS = { months: { min: 1, max: 36 } } as const;

export const DEFAULT_CHECKUP_SETTINGS: CheckupSettings = { enabled: false, months: 12 };

export function parseCheckupSettings(stored: Record<string, string | undefined>): CheckupSettings {
  const raw = stored.checkup_months?.trim();
  const n = raw ? Number(raw) : NaN;
  const { min, max } = CHECKUP_LIMITS.months;
  return {
    enabled: (stored.checkup_reminders_enabled ?? "").trim().toLowerCase() === "true",
    months: Number.isInteger(n) && n >= min && n <= max ? n : DEFAULT_CHECKUP_SETTINGS.months,
  };
}

export function formatCheckupFee(price: Pick<ServicePrice, "msrp" | "currency"> | null | undefined): string | null {
  if (!price || !Number.isFinite(price.msrp) || price.msrp <= 0) return null;
  const cents = Math.round(price.msrp * 100);
  const amount = cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
  const currency = (price.currency || "SGD").toUpperCase();
  return currency === "SGD" ? `S$${amount}` : `${currency} ${amount}`;
}

export type CheckupBlock = "disabled" | "no_fee";

export function checkupBlock(settings: CheckupSettings, fee: string | null): CheckupBlock | null {
  if (!settings.enabled) return "disabled";
  if (!fee) return "no_fee";
  return null;
}

export function addMonths(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}

export const sgtMidnight = (ymd: string) => new Date(`${ymd}T00:00:00+08:00`).toISOString();

export type CheckupTiming =
  | {
      due: true;
      deliveredOn: string;
      milestoneMonths: number;
      milestoneOn: string;
    }
  | { due: false; reason: "not_delivered" | "too_early" };

export function checkupTiming(input: { deliveredAt: string | null | undefined; now: Date; months: number }): CheckupTiming {
  if (!input.deliveredAt || !Number.isFinite(Date.parse(input.deliveredAt))) {
    return { due: false, reason: "not_delivered" };
  }
  const deliveredOn = sgtDate(input.deliveredAt);
  const today = sgtDate(input.now);
  const [dy, dm] = deliveredOn.split("-").map(Number);
  const [ty, tm] = today.split("-").map(Number);
  let elapsed = (ty - dy) * 12 + (tm - dm);
  if (addMonths(deliveredOn, elapsed) > today) elapsed -= 1;
  const k = Math.floor(elapsed / input.months);
  if (k < 1) return { due: false, reason: "too_early" };
  const milestoneMonths = k * input.months;
  return { due: true, deliveredOn, milestoneMonths, milestoneOn: addMonths(deliveredOn, milestoneMonths) };
}

export function deliveredBefore(input: { now: Date; months: number }): string {
  return sgtMidnight(addDays(addMonths(sgtDate(input.now), -input.months), 4));
}

export function periodStart(input: { now: Date; months: number }): string {
  return sgtMidnight(addMonths(sgtDate(input.now), -input.months));
}

export type CheckupPurchaseLine = {
  order_id: string;
  order_item_id: string;
  product_type: string;
  tier: string | null;
  units: number;
};

export function isCheckupCovered(line: Pick<CheckupPurchaseLine, "product_type" | "tier" | "units">): boolean {
  return line.product_type === "pillow" && line.tier === "premium" && line.units > 0;
}

export const CHECKUP_PRODUCT = purchaseLabel({ productType: "pillow", tier: "premium", size: null, length: null });

export function coveredLineByOrder(lines: readonly CheckupPurchaseLine[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of [...lines].sort((a, b) => a.order_item_id.localeCompare(b.order_item_id))) {
    if (isCheckupCovered(line) && !out.has(line.order_id)) out.set(line.order_id, line.order_item_id);
  }
  return out;
}

export const CHECKUP_ORDER_SELECT = "id, order_number, customer_id, email, status, paid_at, delivered_at";

export type CheckupOrderRow = {
  id: string;
  order_number: string;
  customer_id: string | null;
  email: string | null;
  status: string;
  paid_at: string | null;
  delivered_at: string | null;
};

export function isCountedCheckupOrder(o: Pick<CheckupOrderRow, "paid_at" | "status">): boolean {
  return Boolean(o.paid_at) && !NOT_A_PURCHASE.has(o.status);
}

export type CheckupLedgerRow = {
  channel: "email" | "whatsapp";
  customer_id: string;
  template: string;
  entity_id: string;
  status: string;
  attempts?: number | null;
  sent_at: string | null;
  created_at: string;
};

export type CheckupBookingRow = { customer_id: string; status: string; start_at: string };

export const READJUSTED_STATUSES = ["booked", "attended"] as const;

export type CheckupCandidate = {
  customerId: string;
  order: CheckupOrderRow;
  orderItemId: string;
  deliveredOn: string;
  milestoneMonths: number;
  milestoneOn: string;
  template: CheckupTemplate;
};

export type CheckupSkip = "readjusted_recently" | "reminded_recently";

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);
const sameMessage = (r: CheckupLedgerRow, c: Pick<CheckupCandidate, "customerId" | "template" | "order">) =>
  r.customer_id === c.customerId && r.template === c.template && r.entity_id === c.order.id;

export function isRetryableEmail(row: Pick<CheckupLedgerRow, "channel" | "status" | "attempts">, maxAttempts: number) {
  return row.channel === "email" && row.status === "failed" && Number(row.attempts ?? 1) < maxAttempts;
}

function remindedAt(row: CheckupLedgerRow, maxAttempts: number): number | null {
  const live = row.status === "sent" || row.status === "pending" || isRetryableEmail(row, maxAttempts);
  if (!live) return null;
  const at = ms(row.sent_at ?? row.created_at);
  return Number.isFinite(at) ? at : null;
}

export function selectCheckupCandidates(input: {
  orders: readonly CheckupOrderRow[];
  covered: ReadonlyMap<string, string>;
  ledger: readonly CheckupLedgerRow[];
  bookings: readonly CheckupBookingRow[];
  now: Date;
  months: number;
  maxEmailAttempts: number;
}): { due: CheckupCandidate[]; retries: CheckupCandidate[]; skipped: Record<CheckupSkip, number> } {
  const skipped: Record<CheckupSkip, number> = { readjusted_recently: 0, reminded_recently: 0 };
  const from = ms(periodStart({ now: input.now, months: input.months }));

  const readjusted = new Set(
    input.bookings
      .filter((b) => (READJUSTED_STATUSES as readonly string[]).includes(b.status) && ms(b.start_at) >= from)
      .map((b) => b.customer_id),
  );

  const fresh = new Map<string, CheckupCandidate[]>();
  const retries: CheckupCandidate[] = [];
  for (const order of input.orders) {
    const customerId = order.customer_id;
    const orderItemId = input.covered.get(order.id);
    if (!customerId || !orderItemId || !isCountedCheckupOrder(order)) continue;
    const timing = checkupTiming({ deliveredAt: order.delivered_at, now: input.now, months: input.months });
    if (!timing.due) continue;
    const candidate: CheckupCandidate = {
      customerId,
      order,
      orderItemId,
      deliveredOn: timing.deliveredOn,
      milestoneMonths: timing.milestoneMonths,
      milestoneOn: timing.milestoneOn,
      template: checkupTemplate(timing.milestoneMonths),
    };
    const own = input.ledger.filter((r) => sameMessage(r, candidate));
    if (own.length > 0) {
      const email = own.find((r) => r.channel === "email");
      if (email && isRetryableEmail(email, input.maxEmailAttempts) && !readjusted.has(customerId)) retries.push(candidate);
      continue;
    }
    fresh.set(customerId, [...(fresh.get(customerId) ?? []), candidate]);
  }

  const due: CheckupCandidate[] = [];
  for (const [customerId, list] of fresh) {
    if (readjusted.has(customerId)) {
      skipped.readjusted_recently += list.length;
      continue;
    }
    const open = list.filter(
      (c) =>
        !input.ledger.some((r) => {
          if (r.customer_id !== customerId || r.entity_id === c.order.id) return false;
          const at = remindedAt(r, input.maxEmailAttempts);
          return at !== null && at >= from;
        }),
    );
    skipped.reminded_recently += list.length - open.length;
    if (open.length === 0) continue;
    const [first, ...rest] = open.sort(byMilestone);
    due.push(first);
    skipped.reminded_recently += rest.length;
  }

  return { due: due.sort(byMilestone), retries: retries.sort(byMilestone), skipped };
}

function byMilestone(a: CheckupCandidate, b: CheckupCandidate): number {
  return a.milestoneOn.localeCompare(b.milestoneOn) || a.order.id.localeCompare(b.order.id);
}

export type CheckupEmailSkip = AftercareEmailSkip | "no_marketing_consent";
export type CheckupEmailDecision = AftercareEmailDecision | { send: false; skip: "no_marketing_consent" };

export function requireMarketingConsent(
  decision: AftercareEmailDecision,
  marketingEmail: string | null | undefined,
): CheckupEmailDecision {
  if (decision.send && marketingEmail !== "subscribed") return { send: false, skip: "no_marketing_consent" };
  return decision;
}

export function decideCheckupEmail(input: {
  optedIn: boolean | null | undefined;
  marketingEmail: string | null | undefined;
  email: string | null | undefined;
  allowed: (email: string) => boolean;
}): CheckupEmailDecision {
  const decision = decideAftercareEmail(input);
  return requireMarketingConsent(decision, input.marketingEmail);
}

export type CheckupChannelPlan = {
  email: CheckupEmailDecision;
  whatsapp: ReviewWhatsAppDecision;
  any: boolean;
};

export function planCheckupChannels(email: CheckupEmailDecision, whatsapp: ReviewWhatsAppDecision): CheckupChannelPlan {
  return { email, whatsapp, any: email.send || whatsapp.send };
}

export type CheckupReport = {
  enabled: boolean;
  months: number;
  blocked: CheckupBlock | null;
  fee: string | null;
  feeError: string | null;
  candidates: number;
  reachable: number;
  deferred: number;
  sent: { email: number; whatsapp: number };
  failed: { email: number; whatsapp: number };
  retried: number;
  skipped: Record<CheckupSkip, number> & {
    no_channel: number;
    not_marked_delivered: number;
  };
  emailSkipped: Partial<Record<CheckupEmailSkip, number>>;
  whatsappSkipped: Partial<Record<ReviewWhatsAppSkip, number>>;
  errors: string[];
};

export function emptyCheckupReport(settings: CheckupSettings, fee: { fee: string | null; error?: string | null }): CheckupReport {
  return {
    enabled: settings.enabled,
    months: settings.months,
    blocked: checkupBlock(settings, fee.fee),
    fee: fee.fee,
    feeError: fee.fee ? null : (fee.error ?? null),
    candidates: 0,
    reachable: 0,
    deferred: 0,
    sent: { email: 0, whatsapp: 0 },
    failed: { email: 0, whatsapp: 0 },
    retried: 0,
    skipped: { readjusted_recently: 0, reminded_recently: 0, no_channel: 0, not_marked_delivered: 0 },
    emailSkipped: {},
    whatsappSkipped: {},
    errors: [],
  };
}

export const CHECKUP_SKIP_LABELS: Record<keyof CheckupReport["skipped"], string> = {
  readjusted_recently: "Re-adjustment booked or attended this period",
  reminded_recently: "Reminded about another order this period",
  no_channel: "No email or WhatsApp to reach them",
  not_marked_delivered: "Orders never marked delivered",
};

export const CHECKUP_EMAIL_SKIP_LABELS: Record<CheckupEmailSkip, string> = {
  ...EMAIL_SKIP_LABELS,
  no_marketing_consent: "No marketing consent",
};

export const CHECKUP_WHATSAPP_SKIP_LABELS = WHATSAPP_SKIP_LABELS;
