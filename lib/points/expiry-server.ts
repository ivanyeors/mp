/**
 * The daily points expiry run (PRD-loyalty-points slice 07; ADR 0030 rules o,
 * p): the IO around the pure rules in ./expiry. It is chained onto the
 * `results-sla` job after the earn and the reservation sweep; there is no
 * third cron.
 *
 * 1. **Expire.** `expire_due_points` writes one `expire` entry for each
 *    Customer whose clock ran out before today, under the per-Customer lock.
 *    A re-run writes nothing. Nothing while points are off.
 * 2. **Remind.** `points_expiry_reminder_candidates` lists everyone holding
 *    points whose expiry date is within the first reminder's reach, with their
 *    clock. The plan picks the latest reminder due for each, keeps the minimum
 *    and the consent rules, and leaves out what this clock already sent. Each
 *    send is claimed in `customer_emails` first (`dispatchCustomerEmail`,
 *    keyed on the clock's entity), so a manual re-run emails nobody twice.
 *
 * It never throws: a failure is reported in the job's answer, and tomorrow's
 * run does what today's missed.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isAftercareEmailAllowed } from "@/lib/aftercare/channels";
import { getSupportInbox } from "@/lib/email/contact";
import type { EmailCopy } from "@/lib/email/copy";
import { loadEmailCopy } from "@/lib/email/copy-store";
import { CUSTOMER_EMAIL_MAX_ATTEMPTS, dispatchCustomerEmail } from "@/lib/email/customer-emails";
import { POINTS_EXPIRY_EMAIL_COPY, renderPointsExpiryEmail } from "@/lib/email/points";
import type { EmailTransport } from "@/lib/email/types";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import {
  POINTS_EXPIRY_TEMPLATES,
  POINTS_EXPIRY_TEMPLATE_LIKE,
  POINTS_EXPIRY_WINDOW_MONTHS,
  emptyPointsExpirySkips,
  formatExpiryDate,
  planPointsExpiryReminders,
  sgtToday,
  type PlannedPointsReminder,
  type PointsExpiryCandidate,
  type PointsExpiryLedgerRow,
  type PointsExpirySkip,
  type PointsExpiryTemplate,
} from "./expiry";
import { readPointsSettings } from "./server";

/** At most this many reminders sent per run; the rest stay due for the next. */
export const POINTS_EXPIRY_BATCH = 100;
/** Ids per `in (...)` filter, so a request URL stays well under the limit. */
const CHUNK = 150;

export interface PointsExpiryReport {
  /** False when a whole step could not run; `errors` says which. */
  ok: boolean;
  /** `points_enabled`: while off, nothing expires and nobody is reminded. */
  enabled: boolean;
  /** Balances expired this run. */
  expired: number;
  /** Customers holding points whose expiry date is within the reminders' reach. */
  candidates: number;
  /** Reminders due today, before the batch limit. */
  due: number;
  sent: Record<PointsExpiryTemplate, number>;
  failed: number;
  /** Due, but beyond this run's batch: they go on the next run. */
  deferred: number;
  skipped: Record<PointsExpirySkip, number>;
  errors: string[];
}

function emptyReport(): PointsExpiryReport {
  return {
    ok: true,
    enabled: false,
    expired: 0,
    candidates: 0,
    due: 0,
    sent: Object.fromEntries(POINTS_EXPIRY_TEMPLATES.map((t) => [t, 0])) as Record<PointsExpiryTemplate, number>,
    failed: 0,
    deferred: 0,
    skipped: emptyPointsExpirySkips(),
    errors: [],
  };
}

const message = (e: unknown) =>
  e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? String(e.message) : String(e);

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0);

type CandidateRow = {
  customer_id: string;
  email: string | null;
  first_name: string | null;
  locale: string | null;
  marketing_email: string | null;
  aftercare_email: boolean | null;
  available: number;
  clock_entity_id: string;
  expires_on: string;
};

async function readCandidates(admin: SupabaseClient, now: Date): Promise<PointsExpiryCandidate[]> {
  const { data, error } = await admin.rpc("points_expiry_reminder_candidates", {
    p_now: now.toISOString(),
    p_within_months: POINTS_EXPIRY_WINDOW_MONTHS,
  });
  if (error) throw new Error(`Could not list the points expiry reminders: ${error.message}`);
  if (!Array.isArray(data)) return [];
  return (data as CandidateRow[])
    .filter((r) => r && r.customer_id && r.clock_entity_id && typeof r.expires_on === "string")
    .map((r) => ({
      customerId: r.customer_id,
      email: r.email,
      firstName: r.first_name,
      locale: r.locale,
      marketingEmail: r.marketing_email,
      aftercareEmail: r.aftercare_email,
      available: num(r.available),
      clockEntityId: r.clock_entity_id,
      expiresOn: r.expires_on.slice(0, 10),
    }));
}

/** Every reminder row these Customers have in `customer_emails`. */
async function readLedger(admin: SupabaseClient, customerIds: readonly string[]): Promise<PointsExpiryLedgerRow[]> {
  const out: PointsExpiryLedgerRow[] = [];
  for (let i = 0; i < customerIds.length; i += CHUNK) {
    const { data, error } = await admin
      .from("customer_emails")
      .select("customer_id, template, entity_id, status, attempts")
      .like("template", POINTS_EXPIRY_TEMPLATE_LIKE)
      .in("customer_id", customerIds.slice(i, i + CHUNK));
    if (error) throw new Error(`Could not read the points reminders already sent: ${error.message}`);
    out.push(...((data ?? []) as PointsExpiryLedgerRow[]));
  }
  return out;
}

/** The shop, the terms and the Profile, in the customer's own locale. */
export function pointsExpiryLinks(origin: string, locale: string | null) {
  const lang = locale && isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
  const base = origin.replace(/\/$/, "");
  return {
    shopUrl: `${base}${withLocale("/shop", lang)}`,
    termsUrl: `${base}${withLocale("/points", lang)}`,
    accountUrl: `${base}${withLocale("/account", lang)}`,
  };
}

/**
 * The daily run: expire, then remind. `transport` and `allowed` are for tests;
 * the job passes neither.
 */
export async function runPointsExpiry(
  admin: SupabaseClient,
  opts: {
    origin: string;
    now: Date;
    limit?: number;
    transport?: EmailTransport;
    allowed?: (email: string) => boolean;
  },
): Promise<PointsExpiryReport> {
  const report = emptyReport();

  // 1. Expire. Its own step: a failure here does not hold back the reminders.
  try {
    const { data, error } = await admin.rpc("expire_due_points", { p_now: opts.now.toISOString() });
    if (error) throw new Error(error.message);
    report.expired = num(data);
  } catch (e) {
    report.ok = false;
    report.errors.push(`Could not expire points: ${message(e)}`);
  }

  // 2. Remind.
  try {
    const settings = await readPointsSettings(admin);
    report.enabled = settings.enabled;
    if (!settings.enabled) return report;

    const candidates = await readCandidates(admin, opts.now);
    report.candidates = candidates.length;
    if (candidates.length === 0) return report;

    const ledger = await readLedger(admin, [...new Set(candidates.map((c) => c.customerId))]);
    const plan = planPointsExpiryReminders({
      candidates,
      ledger,
      minRedeem: settings.minRedeem,
      today: sgtToday(opts.now),
      allowed: opts.allowed ?? ((to) => isAftercareEmailAllowed(to)),
      maxEmailAttempts: CUSTOMER_EMAIL_MAX_ATTEMPTS,
    });
    report.skipped = plan.skipped;
    report.due = plan.due.length;
    const limit = opts.limit ?? POINTS_EXPIRY_BATCH;
    report.deferred = Math.max(0, plan.due.length - limit);
    if (plan.due.length === 0) return report;

    // The words Staff saved on Email templates, or the defaults (never throws).
    const copy = await loadEmailCopy(POINTS_EXPIRY_EMAIL_COPY, { admin });
    for (const item of plan.due.slice(0, limit)) {
      const out = await sendReminder(admin, item, { origin: opts.origin, copy, transport: opts.transport });
      if (out.sent) report.sent[item.template] += 1;
      else if (out.error) {
        report.failed += 1;
        report.errors.push(`${item.candidate.customerId}: ${item.template} failed, will retry`);
      } else report.skipped.already_sent += 1;
    }
  } catch (e) {
    report.ok = false;
    report.errors.push(message(e));
  }
  return report;
}

function sendReminder(
  admin: SupabaseClient,
  item: PlannedPointsReminder,
  ctx: { origin: string; copy: EmailCopy<keyof typeof POINTS_EXPIRY_EMAIL_COPY.fields & string>; transport?: EmailTransport },
) {
  const { candidate: c } = item;
  return dispatchCustomerEmail({
    admin,
    transport: ctx.transport,
    key: { customerId: c.customerId, template: item.template, entityId: c.clockEntityId },
    to: item.to,
    replyTo: getSupportInbox(),
    render: () =>
      renderPointsExpiryEmail(
        {
          firstName: c.firstName,
          points: c.available,
          expiresOn: formatExpiryDate(c.expiresOn),
          months: item.months,
          ...pointsExpiryLinks(ctx.origin, c.locale),
        },
        ctx.copy,
      ),
  });
}
