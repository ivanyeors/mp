/**
 * The Check-up reminder (PRD customer-crm slice 08, ADR 0028 f, h): a yearly
 * "time for a re-adjustment" for a Premium Mpillow, which says plainly that the
 * visit is paid, and at what price. This file is the pure part — settings, the
 * timing and skip rules, coverage, each channel's decision and the run's
 * report — so the daily job and the Aftercare card decide the same way. The IO
 * is in ./checkup-server.
 *
 * It is an Aftercare message, and stays one only while all of this is true:
 *  - it is about a product the customer owns: a Premium Mpillow on a counted,
 *    delivered Order, not returned;
 *  - it carries no discount and no other product. Its one price is the
 *    re-adjustment fee, read from Costings at send time;
 *  - it honours `aftercare_email` and `aftercare_whatsapp`;
 *  - it goes at most once per milestone per Order, through the two ledgers.
 *
 * Offering a paid visit is direct marketing under the PDPA, so it goes only to
 * customers who agreed (README, second hazard): email needs Marketing consent,
 * and WhatsApp's opt-in wording already names the paid check-up (slice 13).
 */

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

// ─── The ledger key ──────────────────────────────────────────────────────────

/** Registry id of the email (lib/email/registry.ts). The ledgers key each send by milestone instead. */
export const CHECKUP_EMAIL_ID = "aftercare.checkup" as const;

/** Every check-up template key starts with this: `aftercare.checkup_12m`, `aftercare.checkup_24m`… */
export const CHECKUP_TEMPLATE_PREFIX = "aftercare.checkup_" as const;

/** A PostgREST `like` pattern for every check-up row in either ledger. */
export const CHECKUP_TEMPLATE_LIKE = `${CHECKUP_TEMPLATE_PREFIX}%`;

export type CheckupTemplate = `aftercare.checkup_${number}m`;

/**
 * The template key of both ledgers, `customer_emails` and `customer_whatsapp`,
 * for one milestone. Its `entity_id` is the Order: once per milestone per Order.
 */
export function checkupTemplate(milestoneMonths: number): CheckupTemplate {
  return `${CHECKUP_TEMPLATE_PREFIX}${milestoneMonths}m`;
}

/** The milestone a ledger key names, or null for any other template. */
export function milestoneOfTemplate(template: string): number | null {
  const m = /^aftercare\.checkup_(\d+)m$/.exec(template);
  return m ? Number(m[1]) : null;
}

// ─── Settings ────────────────────────────────────────────────────────────────

/** `site_settings` keys, seeded by 20261020133000_checkup_reminders.sql. */
export const CHECKUP_SETTING_KEYS = ["checkup_reminders_enabled", "checkup_months"] as const;
export type CheckupSettingKey = (typeof CHECKUP_SETTING_KEYS)[number];

export type CheckupSettings = {
  enabled: boolean;
  /** Months between check-ups: the first is due this long after delivery, then every this long. */
  months: number;
};

export const CHECKUP_LIMITS = { months: { min: 1, max: 36 } } as const;

/** Off until the owner switches it on; a missing key never starts sending. */
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

// ─── The fee ─────────────────────────────────────────────────────────────────

/**
 * The fee as the message states it: "S$30", "S$32.50". Null when there is no
 * fee to state — a fee of $0 makes every visit free (ADR 0024), and a check-up
 * that says "a paid visit: S$0" is not true, so nothing is sent.
 */
export function formatCheckupFee(price: Pick<ServicePrice, "msrp" | "currency"> | null | undefined): string | null {
  if (!price || !Number.isFinite(price.msrp) || price.msrp <= 0) return null;
  const cents = Math.round(price.msrp * 100);
  const amount = cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
  const currency = (price.currency || "SGD").toUpperCase();
  return currency === "SGD" ? `S$${amount}` : `${currency} ${amount}`;
}

/** Why the run sends nothing at all, or null when it may send. */
export type CheckupBlock = "disabled" | "no_fee";

export function checkupBlock(settings: CheckupSettings, fee: string | null): CheckupBlock | null {
  if (!settings.enabled) return "disabled";
  if (!fee) return "no_fee";
  return null;
}

// ─── Timing ──────────────────────────────────────────────────────────────────

/** YYYY-MM-DD plus n calendar months, the day clamped to the month's end (31 Jan + 1 → 28 Feb). */
export function addMonths(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
}

/** Midnight in Singapore at the start of `ymd`, as an ISO instant. */
export const sgtMidnight = (ymd: string) => new Date(`${ymd}T00:00:00+08:00`).toISOString();

export type CheckupTiming =
  | {
      due: true;
      deliveredOn: string;
      /** The milestone due now, in months after delivery: 12, 24… */
      milestoneMonths: number;
      /** The day it fell due, YYYY-MM-DD in Singapore. */
      milestoneOn: string;
    }
  | { due: false; reason: "not_delivered" | "too_early" };

/**
 * The timing rule, in Singapore calendar days: due on the first run on or
 * after delivery + `months`, and again each `months` after that. Only the
 * latest milestone reached is due; one missed while sending was off is never
 * sent late beside it.
 */
export function checkupTiming(input: { deliveredAt: string | null | undefined; now: Date; months: number }): CheckupTiming {
  if (!input.deliveredAt || !Number.isFinite(Date.parse(input.deliveredAt))) {
    return { due: false, reason: "not_delivered" };
  }
  const deliveredOn = sgtDate(input.deliveredAt);
  const today = sgtDate(input.now);
  const [dy, dm] = deliveredOn.split("-").map(Number);
  const [ty, tm] = today.split("-").map(Number);
  // Whole months since delivery: the calendar difference, less one if this
  // month's anniversary is still ahead.
  let elapsed = (ty - dy) * 12 + (tm - dm);
  if (addMonths(deliveredOn, elapsed) > today) elapsed -= 1;
  const k = Math.floor(elapsed / input.months);
  if (k < 1) return { due: false, reason: "too_early" };
  const milestoneMonths = k * input.months;
  return { due: true, deliveredOn, milestoneMonths, milestoneOn: addMonths(deliveredOn, milestoneMonths) };
}

/**
 * The database pre-filter on `delivered_at`: every Order whose first milestone
 * can have been reached by today is before this instant. Loose by a few days,
 * for months that end early; {@link checkupTiming} still decides each row.
 */
export function deliveredBefore(input: { now: Date; months: number }): string {
  return sgtMidnight(addDays(addMonths(sgtDate(input.now), -input.months), 4));
}

/** The start of "within the previous `months`", for re-adjustments and earlier check-ups. */
export function periodStart(input: { now: Date; months: number }): string {
  return sgtMidnight(addMonths(sgtDate(input.now), -input.months));
}

// ─── Coverage ────────────────────────────────────────────────────────────────

/**
 * A `customer_purchase_lines` row (CRM slice 04: `classifyOrderLine` in SQL,
 * with its parity check), plus the units still owned.
 */
export type CheckupPurchaseLine = {
  order_id: string;
  order_item_id: string;
  product_type: string;
  tier: string | null;
  /** quantity − returned_quantity, from `order_items`. */
  units: number;
};

/**
 * Coverage: Premium Mpillow only (owner, 2026-10-20). A Basic Mpillow, an
 * Mbolster, an accessory and a pillow whose Tier is unknown are not covered.
 * A line fully returned is no longer owned. Coverage is code, not a setting.
 */
export function isCheckupCovered(line: Pick<CheckupPurchaseLine, "product_type" | "tier" | "units">): boolean {
  return line.product_type === "pillow" && line.tier === "premium" && line.units > 0;
}

/** What the message calls the product: every covered line is a Premium Mpillow. */
export const CHECKUP_PRODUCT = purchaseLabel({ productType: "pillow", tier: "premium", size: null, length: null });

/**
 * The covered line each Order is reminded about: its first Premium Mpillow
 * still owned. An Order with a Premium Mpillow and other lines — a Paired
 * build among them — gets one check-up, for this line.
 */
export function coveredLineByOrder(lines: readonly CheckupPurchaseLine[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of [...lines].sort((a, b) => a.order_item_id.localeCompare(b.order_item_id))) {
    if (isCheckupCovered(line) && !out.has(line.order_id)) out.set(line.order_id, line.order_item_id);
  }
  return out;
}

// ─── Candidates and skips ────────────────────────────────────────────────────

/** The Order columns the job reads. */
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

/** A counted Order: paid, and not one whose money went back. */
export function isCountedCheckupOrder(o: Pick<CheckupOrderRow, "paid_at" | "status">): boolean {
  return Boolean(o.paid_at) && !NOT_A_PURCHASE.has(o.status);
}

/** One check-up row from either ledger. */
export type CheckupLedgerRow = {
  channel: "email" | "whatsapp";
  customer_id: string;
  template: string;
  entity_id: string;
  status: string;
  /** customer_emails only: claims so far (3 is the last). */
  attempts?: number | null;
  sent_at: string | null;
  created_at: string;
};

/** A Re-adjustment booking, as the skip rule reads it. */
export type CheckupBookingRow = { customer_id: string; status: string; start_at: string };

/** "Booked or attended" (slice 08): a visit that is happening or happened. */
export const READJUSTED_STATUSES = ["booked", "attended"] as const;

export type CheckupCandidate = {
  customerId: string;
  order: CheckupOrderRow;
  /** The Premium Mpillow line the booking button names. */
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

/** A failed email with attempts left: a later run retries it (claim_customer_email). */
export function isRetryableEmail(row: Pick<CheckupLedgerRow, "channel" | "status" | "attempts">, maxAttempts: number) {
  return row.channel === "email" && row.status === "failed" && Number(row.attempts ?? 1) < maxAttempts;
}

/**
 * Whether a ledger row means the Customer has been reminded: it went out, is
 * going out, or is an email still to be retried. A final failure reached
 * nobody. Dated by its send, else its claim.
 */
function remindedAt(row: CheckupLedgerRow, maxAttempts: number): number | null {
  const live = row.status === "sent" || row.status === "pending" || isRetryableEmail(row, maxAttempts);
  if (!live) return null;
  const at = ms(row.sent_at ?? row.created_at);
  return Number.isFinite(at) ? at : null;
}

/**
 * Who is due a check-up today, and who is skipped, by reason. Pure.
 *
 * - An Order is due when it is counted, holds a Premium Mpillow still owned
 *   (`covered`), and has reached a milestone ({@link checkupTiming}) that
 *   neither ledger holds yet. A milestone either ledger holds is done, except
 *   for an email still to be retried, which is returned in `retries`.
 * - **Skip:** a Customer with a Re-adjustment booking booked or attended within
 *   the previous `months` (`readjusted_recently`). A booking still to come
 *   counts: they have already booked.
 * - **Skip:** a Customer reminded about another Order within the previous
 *   `months` (`reminded_recently`). So a Customer hears about one Order a
 *   period, whatever they own; with several Orders due at once, the most
 *   overdue goes and the others are skipped. An Order's own earlier milestones
 *   do not count: the timing rule spaces them already.
 *
 * Skips are counted per Order, never sent. Oldest milestone first, so a capped
 * run reaches the most overdue first.
 */
export function selectCheckupCandidates(input: {
  orders: readonly CheckupOrderRow[];
  /** Order id → its covered Premium Mpillow line (see {@link coveredLineByOrder}). */
  covered: ReadonlyMap<string, string>;
  /** Every check-up row of these Customers, in both ledgers. */
  ledger: readonly CheckupLedgerRow[];
  /** Their Re-adjustment bookings, booked or attended. */
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
      // Claimed by an earlier run: only a failed email is ever tried again.
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
    // An Order's own earlier milestones never hold it back: the timing rule
    // already spaces them a period apart, and the last one went about a
    // period ago to the day.
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

// ─── Channels ────────────────────────────────────────────────────────────────

export type CheckupEmailSkip = AftercareEmailSkip | "no_marketing_consent";
export type CheckupEmailDecision = AftercareEmailDecision | { send: false; skip: "no_marketing_consent" };

/**
 * The consent gate of a consent-gated reminder: an email that would go, goes
 * only to a Customer whose `marketing_email` is `subscribed`. The check-up
 * (below) is the one reminder that uses it now; the points expiry reminders
 * that shared it went when points stopped expiring (ADR 0030, 2026-10-31).
 * `not_subscribed`, `unsubscribed` and an unknown value are all no.
 */
export function requireMarketingConsent(
  decision: AftercareEmailDecision,
  /** `customers.marketing_email` (migration slice 07). */
  marketingEmail: string | null | undefined,
): CheckupEmailDecision {
  if (decision.send && marketingEmail !== "subscribed") return { send: false, skip: "no_marketing_consent" };
  return decision;
}

/**
 * Email's send-or-skip for the check-up: the Aftercare email decision (the
 * switch, an address, the allowlist), and Marketing consent.
 */
export function decideCheckupEmail(input: {
  /** `customers.aftercare_email`. Only an explicit false is off. */
  optedIn: boolean | null | undefined;
  /** `customers.marketing_email` (migration slice 07). */
  marketingEmail: string | null | undefined;
  email: string | null | undefined;
  allowed: (email: string) => boolean;
}): CheckupEmailDecision {
  const decision = decideAftercareEmail(input);
  // ── CONSENT ── The one Aftercare rule that reads marketing_email (README, second hazard): a
  // paid visit is direct marketing under the PDPA. If counsel advises a Premium Mpillow buyer may
  // be reminded without it, make this line `return decision` (customer-crm PRD, Owner decisions).
  // Pinned by checkup.test.ts and checkup-job.test.ts, which say which assertions change with it.
  return requireMarketingConsent(decision, input.marketingEmail);
}

export type CheckupChannelPlan = {
  email: CheckupEmailDecision;
  whatsapp: ReviewWhatsAppDecision;
  /** At least one channel will send. Without one, the Order is skipped and counted. */
  any: boolean;
};

export function planCheckupChannels(email: CheckupEmailDecision, whatsapp: ReviewWhatsAppDecision): CheckupChannelPlan {
  return { email, whatsapp, any: email.send || whatsapp.send };
}

// ─── The run's report ────────────────────────────────────────────────────────

export type CheckupReport = {
  enabled: boolean;
  months: number;
  /** Set when nothing is sent today: switched off, or no fee could be read from Costings. */
  blocked: CheckupBlock | null;
  /** The fee as today's messages state it, or null when it could not be read. */
  fee: string | null;
  /** Why there is no fee: the read failed, or the fee is $0. */
  feeError: string | null;
  /** Orders due a check-up today. */
  candidates: number;
  /** Candidates with at least one channel to send on. */
  reachable: number;
  /** Reachable candidates left for the next run by the per-run cap. */
  deferred: number;
  sent: { email: number; whatsapp: number };
  /** Email failures are retried by a later run, up to 3 attempts; WhatsApp is not. */
  failed: { email: number; whatsapp: number };
  /** Earlier failed emails sent this run. */
  retried: number;
  /** Orders, by why they get nothing today. */
  skipped: Record<CheckupSkip, number> & {
    /** Due, but neither channel can reach them. */
    no_channel: number;
    /** A Premium Mpillow paid for long enough ago to be due, never marked delivered. */
    not_marked_delivered: number;
  };
  /** Per channel, among candidates: why that channel will not carry it. */
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

// ─── Wording shared by the card ──────────────────────────────────────────────

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
