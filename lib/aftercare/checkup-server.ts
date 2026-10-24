/**
 * The Check-up reminder job (PRD customer-crm slice 08, ADR 0028 f, g, h): the
 * IO around the pure rules in ./checkup. It runs daily, chained onto
 * `results-sla` through ./job, and the Aftercare card runs its planning half as
 * a dry run to show today's numbers.
 *
 * Once per milestone per Order, per channel. There is no table of its own: each
 * ledger's unique key is the guard, keyed by template `aftercare.checkup_<n>m`
 * and `entity_id` = the Order:
 *  - email in `customer_emails`, claimed by claim_customer_email before the
 *    send. A failed send is retried by a later run, up to 3 attempts, while the
 *    milestone is still the current one and the email may still go;
 *  - WhatsApp in `customer_whatsapp`, through slice 13's channel. Never retried.
 *
 * Coverage is read from `customer_purchase_lines` (CRM slice 04), which is
 * `classifyOrderLine` in SQL with a parity check: Premium Mpillow only.
 *
 * The fee is read from Costings (`loadServicePrices`) at send time, every run.
 * When it cannot be read, or is $0, the run sends nothing: a check-up that does
 * not say what it costs is not sent.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPPORT_WHATSAPP_DISPLAY, SUPPORT_WHATSAPP_URL } from "@/lib/contact";
import { CHECKUP_EMAIL_COPY, renderCheckupEmail } from "@/lib/email/aftercare";
import { loadEmailCopy } from "@/lib/email/copy-store";
import { getSupportInbox } from "@/lib/email/contact";
import { CUSTOMER_EMAIL_MAX_ATTEMPTS, dispatchCustomerEmail } from "@/lib/email/customer-emails";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { loadServicePrices } from "@/lib/pricing/service-prices";
import { notifyAftercareWhatsApp } from "@/lib/whatsapp/aftercare-notify";
import { aftercareDateSgt, checkupTemplateParams } from "@/lib/whatsapp/aftercare-templates";
import { isAftercareEmailAllowed } from "./channels";
import {
  CHECKUP_ORDER_SELECT,
  CHECKUP_PRODUCT,
  CHECKUP_SETTING_KEYS,
  CHECKUP_TEMPLATE_LIKE,
  coveredLineByOrder,
  decideCheckupEmail,
  deliveredBefore,
  emptyCheckupReport,
  formatCheckupFee,
  isCountedCheckupOrder,
  parseCheckupSettings,
  periodStart,
  planCheckupChannels,
  READJUSTED_STATUSES,
  selectCheckupCandidates,
  checkupBlock,
  type CheckupBookingRow,
  type CheckupCandidate,
  type CheckupChannelPlan,
  type CheckupLedgerRow,
  type CheckupOrderRow,
  type CheckupPurchaseLine,
  type CheckupReport,
  type CheckupSettings,
} from "./checkup";
import { bump } from "./review-request";
import { aftercareAccountUrl, decideAftercareWhatsAppFor } from "./review-request-server";

/** At most this many check-ups sent per run; the rest stay due for the next. */
export const CHECKUP_BATCH = 100;
/** At most this many failed emails retried per run. */
const RETRY_BATCH = 50;
/** PostgREST returns at most 1000 rows a request; longer reads page. */
const PAGE = 1000;
/** Ids per `in (...)` filter, so a request URL stays well under the limit. */
const CHUNK = 150;

type CustomerRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  phone: string | null;
  aftercare_email: boolean | null;
  aftercare_whatsapp: boolean | null;
  /** Migration slice 07. Read for the check-up email only (README, second hazard). */
  marketing_email: string | null;
};

const CUSTOMER_SELECT = "id, email, first_name, phone, aftercare_email, aftercare_whatsapp, marketing_email";

export type PlannedCheckup = CheckupCandidate & { customer: CustomerRow; plan: CheckupChannelPlan };

export type CheckupPlan = {
  settings: CheckupSettings;
  /** Orders due today, each with how it would be reached. */
  planned: PlannedCheckup[];
  /** Earlier failed emails that may be retried today. */
  retries: PlannedCheckup[];
  skipped: CheckupReport["skipped"];
};

type Query = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
type Rangeable = Query & { range(from: number, to: number): Query };

/** Every row of an ordered query, a page at a time. */
async function readAll<T>(label: string, build: () => Rangeable): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

/** One read per chunk of ids, concatenated. */
async function readIn<T>(label: string, ids: readonly string[], build: (chunk: string[]) => Query): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await build(ids.slice(i, i + CHUNK));
    if (error) throw new Error(`${label}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

const unique = (ids: Iterable<string | null | undefined>) => [...new Set([...ids].filter((id): id is string => Boolean(id)))];

export async function loadCheckupSettings(admin: SupabaseClient): Promise<CheckupSettings> {
  const { data, error } = await admin
    .from("site_settings")
    .select("key, value")
    .in("key", [...CHECKUP_SETTING_KEYS]);
  if (error) throw new Error(`site_settings: ${error.message}`);
  const stored: Record<string, string> = {};
  for (const row of data ?? []) stored[row.key as string] = row.value as string;
  return parseCheckupSettings(stored);
}

/**
 * The fee as today's messages state it, read from Costings now. Null, with
 * the reason, when it cannot be read or is $0.
 */
export async function readCheckupFee(admin: SupabaseClient): Promise<{ fee: string | null; error: string | null }> {
  try {
    const prices = await loadServicePrices(admin);
    const fee = formatCheckupFee(prices.readjustment);
    return fee ? { fee, error: null } : { fee: null, error: "The re-adjustment fee in Costings is $0" };
  } catch (e) {
    return { fee: null, error: e instanceof Error ? e.message : "service_prices could not be read" };
  }
}

/**
 * The covered Premium Mpillow line of each Order, read from
 * `customer_purchase_lines` with the units still owned.
 */
async function loadCovered(admin: SupabaseClient, orderIds: readonly string[]): Promise<Map<string, string>> {
  if (orderIds.length === 0) return new Map();
  // Coverage, in the query: Premium Mpillow only. isCheckupCovered says the same.
  const lines = await readIn<Omit<CheckupPurchaseLine, "units">>("customer_purchase_lines", orderIds, (chunk) =>
    admin
      .from("customer_purchase_lines")
      .select("order_id, order_item_id, product_type, tier")
      .eq("product_type", "pillow")
      .eq("tier", "premium")
      .in("order_id", chunk),
  );
  if (lines.length === 0) return new Map();
  const items = await readIn<{ id: string; quantity: number; returned_quantity: number | null }>(
    "order_items",
    unique(lines.map((l) => l.order_item_id)),
    (chunk) => admin.from("order_items").select("id, quantity, returned_quantity").in("id", chunk),
  );
  const units = new Map(items.map((i) => [i.id, Math.max(0, Number(i.quantity) - Number(i.returned_quantity ?? 0))]));
  return coveredLineByOrder(lines.map((l) => ({ ...l, units: units.get(l.order_item_id) ?? 0 })));
}

/** Counted Orders with a Customer, delivered long enough ago that a milestone may be due. */
async function loadDeliveredOrders(admin: SupabaseClient, now: Date, settings: CheckupSettings): Promise<CheckupOrderRow[]> {
  const before = deliveredBefore({ now, months: settings.months });
  const rows = await readAll<CheckupOrderRow>("orders", () =>
    admin
      .from("orders")
      .select(CHECKUP_ORDER_SELECT)
      .not("customer_id", "is", null)
      .not("paid_at", "is", null)
      .lt("delivered_at", before)
      .order("id", { ascending: true }) as unknown as Rangeable,
  );
  return rows.filter(isCountedCheckupOrder);
}

/**
 * Orders with a Premium Mpillow, paid long enough ago to be due, that were
 * never marked delivered: an operations signal, counted and never messaged.
 */
async function countNotMarkedDelivered(admin: SupabaseClient, now: Date, settings: CheckupSettings): Promise<number> {
  const before = deliveredBefore({ now, months: settings.months });
  const rows = await readAll<Pick<CheckupOrderRow, "id" | "paid_at" | "status">>("orders not delivered", () =>
    admin
      .from("orders")
      .select("id, status, paid_at")
      .not("customer_id", "is", null)
      .is("delivered_at", null)
      .lt("paid_at", before)
      .order("id", { ascending: true }) as unknown as Rangeable,
  );
  const counted = rows.filter(isCountedCheckupOrder).map((o) => o.id);
  return (await loadCovered(admin, counted)).size;
}

/** Every check-up row of these Customers, in both ledgers. */
async function loadLedger(admin: SupabaseClient, customerIds: readonly string[]): Promise<CheckupLedgerRow[]> {
  const [emails, whatsapp] = await Promise.all([
    readIn<Omit<CheckupLedgerRow, "channel">>("customer_emails", customerIds, (chunk) =>
      admin
        .from("customer_emails")
        .select("customer_id, template, entity_id, status, attempts, sent_at, created_at")
        .like("template", CHECKUP_TEMPLATE_LIKE)
        .in("customer_id", chunk),
    ),
    readIn<Omit<CheckupLedgerRow, "channel">>("customer_whatsapp", customerIds, (chunk) =>
      admin
        .from("customer_whatsapp")
        .select("customer_id, template, entity_id, status, sent_at, created_at")
        .like("template", CHECKUP_TEMPLATE_LIKE)
        .in("customer_id", chunk),
    ),
  ]);
  return [
    ...emails.map((r) => ({ ...r, channel: "email" as const })),
    ...whatsapp.map((r) => ({ ...r, channel: "whatsapp" as const })),
  ];
}

/** Their Re-adjustment bookings booked or attended within the previous `months` (a future one included). */
async function loadRecentReadjustments(
  admin: SupabaseClient,
  customerIds: readonly string[],
  now: Date,
  settings: CheckupSettings,
): Promise<CheckupBookingRow[]> {
  const from = periodStart({ now, months: settings.months });
  return readIn<CheckupBookingRow>("readjustment_bookings", customerIds, (chunk) =>
    admin
      .from("readjustment_bookings")
      .select("customer_id, status, start_at")
      .in("customer_id", chunk)
      .in("status", [...READJUSTED_STATUSES])
      .gte("start_at", from),
  );
}

async function planOne(admin: SupabaseClient, candidate: CheckupCandidate, customer: CustomerRow): Promise<PlannedCheckup> {
  const email = decideCheckupEmail({
    optedIn: customer.aftercare_email,
    marketingEmail: customer.marketing_email,
    email: candidate.order.email?.trim() || customer.email,
    allowed: (to) => isAftercareEmailAllowed(to),
  });
  const whatsapp = await decideAftercareWhatsAppFor(admin, customer, candidate.template);
  return { ...candidate, customer, plan: planCheckupChannels(email, whatsapp) };
}

/**
 * Who is due today, who may be retried, and who is skipped and why. Reads
 * only; the job and the Aftercare card both start here.
 */
export async function planCheckups(
  admin: SupabaseClient,
  opts: { now: Date; settings?: CheckupSettings },
): Promise<CheckupPlan> {
  const settings = opts.settings ?? (await loadCheckupSettings(admin));
  const [orders, notMarkedDelivered] = await Promise.all([
    loadDeliveredOrders(admin, opts.now, settings),
    countNotMarkedDelivered(admin, opts.now, settings),
  ]);
  const covered = await loadCovered(
    admin,
    orders.map((o) => o.id),
  );
  const coveredOrders = orders.filter((o) => covered.has(o.id));
  const customerIds = unique(coveredOrders.map((o) => o.customer_id));
  const [ledger, bookings] = await Promise.all([
    loadLedger(admin, customerIds),
    loadRecentReadjustments(admin, customerIds, opts.now, settings),
  ]);

  const selected = selectCheckupCandidates({
    orders: coveredOrders,
    covered,
    ledger,
    bookings,
    now: opts.now,
    months: settings.months,
    maxEmailAttempts: CUSTOMER_EMAIL_MAX_ATTEMPTS,
  });
  const skipped: CheckupReport["skipped"] = { ...selected.skipped, no_channel: 0, not_marked_delivered: notMarkedDelivered };

  const wanted = unique([...selected.due, ...selected.retries].map((c) => c.customerId));
  const customers = await readIn<CustomerRow>("customers", wanted, (chunk) =>
    admin.from("customers").select(CUSTOMER_SELECT).in("id", chunk),
  );
  const byId = new Map(customers.map((c) => [c.id, c]));

  const planned: PlannedCheckup[] = [];
  for (const candidate of selected.due) {
    const customer = byId.get(candidate.customerId);
    if (customer) planned.push(await planOne(admin, candidate, customer));
  }
  const retries: PlannedCheckup[] = [];
  for (const candidate of selected.retries.slice(0, RETRY_BATCH)) {
    const customer = byId.get(candidate.customerId);
    if (customer) retries.push(await planOne(admin, candidate, customer));
  }
  return { settings, planned, retries, skipped };
}

/** The booking page for this Premium Mpillow. A signed-out visitor goes through Sign in and back. */
export function checkupBookingUrl(origin: string, orderItemId: string): string {
  const path = withLocale("/appointments", DEFAULT_LOCALE);
  return `${origin.replace(/\/$/, "")}${path}?type=readjustment&item=${encodeURIComponent(orderItemId)}`;
}

async function renderFor(origin: string, item: PlannedCheckup, fee: string) {
  // The words Staff saved on Email templates, or the defaults (never throws).
  const copy = await loadEmailCopy(CHECKUP_EMAIL_COPY);
  return renderCheckupEmail(
    {
      firstName: item.customer.first_name,
      product: CHECKUP_PRODUCT,
      orderNumber: item.order.order_number,
      deliveredOn: aftercareDateSgt(item.order.delivered_at!),
      fee,
      bookingUrl: checkupBookingUrl(origin, item.orderItemId),
      accountUrl: aftercareAccountUrl(origin),
      supportWhatsAppDisplay: SUPPORT_WHATSAPP_DISPLAY,
      supportWhatsAppUrl: SUPPORT_WHATSAPP_URL,
    },
    copy,
  );
}

function sendEmail(admin: SupabaseClient, item: PlannedCheckup, to: string, ctx: { origin: string; fee: string }) {
  return dispatchCustomerEmail({
    admin,
    key: { customerId: item.customerId, template: item.template, entityId: item.order.id },
    to,
    replyTo: getSupportInbox(),
    render: () => renderFor(ctx.origin, item, ctx.fee),
  });
}

/** One check-up: each planned channel claims its own ledger row, then sends. */
async function sendOne(
  admin: SupabaseClient,
  item: PlannedCheckup,
  ctx: { origin: string; fee: string; report: CheckupReport },
): Promise<void> {
  const { report } = ctx;
  const { email, whatsapp } = item.plan;
  await Promise.all([
    email.send
      ? sendEmail(admin, item, email.to, ctx).then((out) => {
          if (out.sent) report.sent.email += 1;
          else if (out.error) {
            report.failed.email += 1;
            report.errors.push(`${item.order.id}: email failed, will retry`);
          }
        })
      : null,
    whatsapp.send
      ? notifyAftercareWhatsApp(admin, {
          customerId: item.customerId,
          template: item.template,
          entityId: item.order.id,
          ...checkupTemplateParams({
            firstName: item.customer.first_name,
            product: CHECKUP_PRODUCT,
            orderNumber: item.order.order_number,
            fee: ctx.fee,
            orderItemId: item.orderItemId,
          }),
        }).then((out) => {
          if (out.sent) report.sent.whatsapp += 1;
          else if ("skip" in out) bump(report.whatsappSkipped, out.skip);
          else {
            report.failed.whatsapp += 1;
            report.errors.push(`${item.order.id}: whatsapp ${out.error}`);
          }
        })
      : null,
  ]);
}

/**
 * The daily run. Plans, and — unless the settings or the fee stop it, or
 * `dryRun` is set — retries failed emails, then sends each reachable Order its
 * check-up. While `checkup_reminders_enabled` is false, or no fee can be read
 * from Costings, it reports and sends nothing.
 */
export async function runCheckups(
  admin: SupabaseClient,
  opts: { origin: string; now: Date; dryRun?: boolean; limit?: number },
): Promise<CheckupReport> {
  // The fee is read first, every run: a run that cannot state it sends nothing.
  const [settings, fee] = await Promise.all([loadCheckupSettings(admin), readCheckupFee(admin)]);
  const report = emptyCheckupReport(settings, fee);
  const plan = await planCheckups(admin, { now: opts.now, settings });
  report.candidates = plan.planned.length;
  report.skipped = { ...plan.skipped };

  const reachable: PlannedCheckup[] = [];
  for (const item of plan.planned) {
    if (!item.plan.email.send) bump(report.emailSkipped, item.plan.email.skip);
    if (!item.plan.whatsapp.send) bump(report.whatsappSkipped, item.plan.whatsapp.skip);
    if (item.plan.any) reachable.push(item);
    else report.skipped.no_channel += 1;
  }
  report.reachable = reachable.length;

  if (opts.dryRun || checkupBlock(settings, fee.fee)) return report;
  const ctx = { origin: opts.origin, fee: fee.fee!, report };

  // Earlier runs' failures first, so an email that fails in this run waits for
  // the next run rather than being retried straight away. Only the email: the
  // WhatsApp row is final either way.
  for (const item of plan.retries) {
    if (!item.plan.email.send) continue;
    const out = await sendEmail(admin, item, item.plan.email.to, ctx);
    if (out.sent) {
      report.sent.email += 1;
      report.retried += 1;
    } else if (out.error) {
      report.failed.email += 1;
      report.errors.push(`${item.order.id}: email retry failed`);
    }
  }

  const limit = opts.limit ?? CHECKUP_BATCH;
  report.deferred = Math.max(0, reachable.length - limit);
  for (const item of reachable.slice(0, limit)) await sendOne(admin, item, ctx);
  return report;
}
