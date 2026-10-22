/**
 * Points expiry and its reminders (PRD-loyalty-points slice 07; ADR 0030
 * rules o, p; 20261021170000_points_expiry.sql): the pure rules. The IO is in
 * ./expiry-server.
 *
 * **The clock.** A balance expires `points_expiry_months` (24) after the
 * customer's last purchase: their latest paid Order, or their Claim bonus if
 * that is later. The Order or Claim bonus entry that set it is the clock's
 * entity. `expiresOn` is the last day the points can be used, a Singapore date;
 * the daily job expires the balance the day after (SQL, `expire_points`).
 *
 * **The reminders.** 3, 2 and 1 months before `expiresOn`. Each is one
 * `customer_emails` row, keyed (Customer, `points.expiry_<n>m`, the clock's
 * entity), so each goes once per clock and a purchase, which starts a new
 * clock, starts three new ones. A run sends only the latest one due, so a
 * missed day never sends two at once. It needs:
 *  - at least `points_min_redeem` available, so the customer can use them;
 *  - Marketing consent, through the check-up reminder's own gate
 *    (`requireMarketingConsent`), so the two reminders cannot drift apart.
 *    Unsubscribing stops them; there is no separate points switch;
 *  - the Aftercare email rules the check-up also keeps: the "Emails after a
 *    purchase" switch (the footer says these are turned off in the account),
 *    an address, and the allowlist outside production.
 */

import { decideAftercareEmail } from "@/lib/aftercare/channels";
import { requireMarketingConsent, type CheckupEmailDecision, type CheckupEmailSkip } from "@/lib/aftercare/checkup";
import { sgtDate } from "@/lib/readjustment/eligibility";

/** The reminders, earliest first: months before the expiry date. */
export const POINTS_EXPIRY_REMINDER_MONTHS = [3, 2, 1] as const;
export type PointsExpiryReminderMonths = (typeof POINTS_EXPIRY_REMINDER_MONTHS)[number];

/** How far ahead the first reminder looks: the candidates' window. */
export const POINTS_EXPIRY_WINDOW_MONTHS = Math.max(...POINTS_EXPIRY_REMINDER_MONTHS);

export type PointsExpiryTemplate = `points.expiry_${PointsExpiryReminderMonths}m`;

/** The `customer_emails.template` (and registry id) of one reminder. */
export function pointsExpiryTemplate(months: PointsExpiryReminderMonths): PointsExpiryTemplate {
  return `points.expiry_${months}m`;
}

export const POINTS_EXPIRY_TEMPLATES: readonly PointsExpiryTemplate[] = POINTS_EXPIRY_REMINDER_MONTHS.map(pointsExpiryTemplate);

/** Matches every reminder's template in `customer_emails`. */
export const POINTS_EXPIRY_TEMPLATE_LIKE = "points.expiry_%";

// ─── Dates ───────────────────────────────────────────────────────────────────

/** Today in Singapore, YYYY-MM-DD. */
export function sgtToday(now: Date): string {
  return sgtDate(now);
}

/**
 * Pure — YYYY-MM-DD less whole months. A day past the shorter month's end
 * becomes its last day (31 May less 3 months is 29 February in 2028), as
 * Postgres's `date - interval` does.
 */
export function minusMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const index = y * 12 + (m - 1) - months;
  const year = Math.floor(index / 12);
  const month = index - year * 12; // 0-based
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  return `${String(year).padStart(4, "0")}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Pure — the day a reminder is due: `months` before the expiry date. */
export function reminderDueOn(expiresOn: string, months: number): string {
  return minusMonths(expiresOn, months);
}

/**
 * Pure — the latest reminder due `today` for a balance expiring on
 * `expiresOn` (both Singapore dates): the nearest milestone whose day has
 * come. Null before the first is due, and from the expiry day itself, when
 * "before then" can no longer be kept.
 */
export function dueExpiryReminder(expiresOn: string, today: string): PointsExpiryReminderMonths | null {
  if (!(today < expiresOn)) return null;
  let due: PointsExpiryReminderMonths | null = null;
  for (const months of POINTS_EXPIRY_REMINDER_MONTHS) {
    if (reminderDueOn(expiresOn, months) <= today) due = months;
  }
  return due;
}

/** "12 March 2028" for "2028-03-12". */
export function formatExpiryDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ─── Consent ─────────────────────────────────────────────────────────────────

export type PointsReminderEmailDecision = CheckupEmailDecision;

/**
 * Email's send-or-skip for a points expiry reminder: the Aftercare email
 * decision (the switch, an address, the allowlist), then Marketing consent
 * through the gate the check-up reminder uses.
 */
export function decidePointsReminderEmail(input: {
  /** `customers.aftercare_email`. Only an explicit false is off. */
  optedIn: boolean | null | undefined;
  /** `customers.marketing_email`. */
  marketingEmail: string | null | undefined;
  email: string | null | undefined;
  allowed: (email: string) => boolean;
}): PointsReminderEmailDecision {
  return requireMarketingConsent(decideAftercareEmail(input), input.marketingEmail);
}

// ─── Planning ────────────────────────────────────────────────────────────────

/** A Customer holding points whose expiry date is within the window (`points_expiry_reminder_candidates`). */
export interface PointsExpiryCandidate {
  customerId: string;
  email: string | null;
  firstName: string | null;
  locale: string | null;
  marketingEmail: string | null;
  aftercareEmail: boolean | null;
  available: number;
  /** The Order or Claim bonus entry that set the clock: what the reminders are keyed on. */
  clockEntityId: string;
  /** YYYY-MM-DD in Singapore: the last day the points can be used. */
  expiresOn: string;
}

/** One reminder row of `customer_emails`. */
export interface PointsExpiryLedgerRow {
  customer_id: string;
  template: string;
  entity_id: string;
  status: string;
  attempts: number | null;
}

export type PointsExpirySkip =
  /** No reminder's day has come yet, or the expiry day has. */
  | "not_due"
  /** Less than points_min_redeem available. */
  | "below_minimum"
  /** This clock's reminder was sent, is in flight, or ran out of attempts. */
  | "already_sent"
  | CheckupEmailSkip;

export const POINTS_EXPIRY_SKIPS: readonly PointsExpirySkip[] = [
  "not_due",
  "below_minimum",
  "already_sent",
  "opted_out",
  "no_email",
  "not_allowed_outside_production",
  "no_marketing_consent",
];

export function emptyPointsExpirySkips(): Record<PointsExpirySkip, number> {
  return Object.fromEntries(POINTS_EXPIRY_SKIPS.map((s) => [s, 0])) as Record<PointsExpirySkip, number>;
}

export interface PlannedPointsReminder {
  candidate: PointsExpiryCandidate;
  months: PointsExpiryReminderMonths;
  template: PointsExpiryTemplate;
  to: string;
}

/**
 * Pure — today's reminders, most urgent first, and why the rest are skipped.
 * A failed send with attempts left is due again while it is still the latest;
 * `claim_customer_email` re-claims it.
 */
export function planPointsExpiryReminders(input: {
  candidates: readonly PointsExpiryCandidate[];
  ledger: readonly PointsExpiryLedgerRow[];
  minRedeem: number;
  /** YYYY-MM-DD in Singapore. */
  today: string;
  allowed: (email: string) => boolean;
  maxEmailAttempts: number;
}): { due: PlannedPointsReminder[]; skipped: Record<PointsExpirySkip, number> } {
  const skipped = emptyPointsExpirySkips();
  const done = new Set(
    input.ledger
      .filter((r) => r.status !== "failed" || (r.attempts ?? 0) >= input.maxEmailAttempts)
      .map((r) => `${r.customer_id}|${r.template}|${r.entity_id}`),
  );
  const due: PlannedPointsReminder[] = [];
  for (const c of input.candidates) {
    const months = dueExpiryReminder(c.expiresOn, input.today);
    if (months === null) {
      skipped.not_due += 1;
      continue;
    }
    if (!(c.available >= input.minRedeem)) {
      skipped.below_minimum += 1;
      continue;
    }
    const template = pointsExpiryTemplate(months);
    if (done.has(`${c.customerId}|${template}|${c.clockEntityId}`)) {
      skipped.already_sent += 1;
      continue;
    }
    const email = decidePointsReminderEmail({
      optedIn: c.aftercareEmail,
      marketingEmail: c.marketingEmail,
      email: c.email,
      allowed: input.allowed,
    });
    if (!email.send) {
      skipped[email.skip] += 1;
      continue;
    }
    due.push({ candidate: c, months, template, to: email.to });
  }
  due.sort(
    (a, b) => a.candidate.expiresOn.localeCompare(b.candidate.expiresOn) || a.candidate.customerId.localeCompare(b.candidate.customerId),
  );
  return { due, skipped };
}
