import type { SupabaseClient } from "@supabase/supabase-js";
import { isPhoneAllowed } from "@/lib/appointments/phone";
import { readWhatsAppGate } from "@/lib/aftercare/preferences";
import { SUPPORT_WHATSAPP_DISPLAY, SUPPORT_WHATSAPP_URL } from "@/lib/contact";
import { REVIEW_REQUEST_EMAIL_COPY, renderReviewRequestEmail } from "@/lib/email/aftercare";
import { loadEmailCopy } from "@/lib/email/copy-store";
import { getSupportInbox } from "@/lib/email/contact";
import { CUSTOMER_EMAIL_MAX_ATTEMPTS, dispatchCustomerEmail } from "@/lib/email/customer-emails";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import {
  aftercareTemplateName,
  aftercareWhatsAppTransportConfigured,
  decideAftercareWhatsApp,
  notifyAftercareWhatsApp,
  type AftercareWaTemplate,
} from "@/lib/whatsapp/aftercare-notify";
import { aftercareDateSgt, reviewRequestTemplateParams } from "@/lib/whatsapp/aftercare-templates";
import { decideAftercareEmail, isAftercareEmailAllowed } from "./channels";
import { hashReviewToken, newReviewToken, reviewLinkUrl } from "./review-link";
import {
  bump,
  dueWindow,
  emptyReviewRequestReport,
  goodsLines,
  isCountedOrder,
  parseReviewRequestSettings,
  planReviewChannels,
  reviewProductLabel,
  reviewRequestBlock,
  reviewRequestTiming,
  REVIEW_ORDER_SELECT,
  REVIEW_REQUEST_SETTING_KEYS,
  REVIEW_REQUEST_TEMPLATE,
  selectReviewRequestCandidates,
  type ReviewCandidate,
  type ReviewChannelPlan,
  type ReviewOrderRow,
  type ReviewRequestReport,
  type ReviewRequestSettings,
  type ReviewWhatsAppDecision,
} from "./review-request";

export const REVIEW_REQUEST_BATCH = 100;
const RETRY_BATCH = 50;

type CustomerRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  phone: string | null;
  aftercare_email: boolean | null;
  aftercare_whatsapp: boolean | null;
};

const CUSTOMER_SELECT = "id, email, first_name, phone, aftercare_email, aftercare_whatsapp";

type PillowById = Map<number, { size: string; kind: string }>;

export type PlannedReviewRequest = ReviewCandidate & {
  customer: CustomerRow;
  plan: ReviewChannelPlan;
};

export type ReviewRequestPlan = {
  settings: ReviewRequestSettings;
  planned: PlannedReviewRequest[];
  alreadyAsked: number;
  notMarkedDelivered: number;
  pillowById: PillowById;
};

export async function loadReviewRequestSettings(admin: SupabaseClient): Promise<ReviewRequestSettings> {
  const { data, error } = await admin
    .from("site_settings")
    .select("key, value")
    .in("key", [...REVIEW_REQUEST_SETTING_KEYS]);
  if (error) throw new Error(`site_settings: ${error.message}`);
  const stored: Record<string, string> = {};
  for (const row of data ?? []) stored[row.key as string] = row.value as string;
  return parseReviewRequestSettings(stored);
}

async function loadDueOrders(
  admin: SupabaseClient,
  now: Date,
  settings: ReviewRequestSettings,
): Promise<ReviewOrderRow[]> {
  const w = dueWindow({ now, daysAfter: settings.daysAfter, maxAgeDays: settings.maxAgeDays });
  const { data, error } = await admin
    .from("orders")
    .select(REVIEW_ORDER_SELECT)
    .not("customer_id", "is", null)
    .not("paid_at", "is", null)
    .gte("delivered_at", w.from)
    .lt("delivered_at", w.to)
    .eq("order_items.kind", "goods");
  if (error) throw new Error(`orders: ${error.message}`);
  return (data ?? []) as unknown as ReviewOrderRow[];
}

async function countNotMarkedDelivered(
  admin: SupabaseClient,
  now: Date,
  settings: ReviewRequestSettings,
): Promise<number> {
  const w = dueWindow({ now, daysAfter: settings.daysAfter, maxAgeDays: settings.maxAgeDays });
  const { data, error } = await admin
    .from("orders")
    .select("id, status, paid_at, order_items!inner(kind)")
    .not("customer_id", "is", null)
    .is("delivered_at", null)
    .gte("paid_at", w.from)
    .lt("paid_at", w.to)
    .eq("order_items.kind", "goods");
  if (error) throw new Error(`orders not delivered: ${error.message}`);
  return ((data ?? []) as Array<Pick<ReviewOrderRow, "paid_at" | "status">>).filter(isCountedOrder).length;
}

async function loadPillows(admin: SupabaseClient, orders: readonly ReviewOrderRow[]): Promise<PillowById> {
  const ids = new Set<number>();
  for (const o of orders) {
    for (const l of goodsLines(o)) {
      const id =
        l.product_variants?.pillow_product_id ??
        (typeof l.customization_snapshot?.pillow_product_id === "number"
          ? (l.customization_snapshot.pillow_product_id as number)
          : null);
      if (id != null) ids.add(id);
    }
  }
  const byId: PillowById = new Map();
  if (ids.size === 0) return byId;
  const { data, error } = await admin.from("pillow_products").select("id, size, kind").in("id", [...ids]);
  if (error) throw new Error(`pillow_products: ${error.message}`);
  for (const p of data ?? []) byId.set(Number(p.id), { size: String(p.size), kind: String(p.kind) });
  return byId;
}

export async function decideAftercareWhatsAppFor(
  admin: SupabaseClient,
  customer: Pick<CustomerRow, "id" | "phone" | "aftercare_whatsapp">,
  template: AftercareWaTemplate = REVIEW_REQUEST_TEMPLATE,
): Promise<ReviewWhatsAppDecision> {
  if (!aftercareWhatsAppTransportConfigured()) return { send: false, skip: "transport_unconfigured" };
  const gate =
    customer.aftercare_whatsapp === true
      ? await readWhatsAppGate(admin, customer.id)
      : { optedIn: false, phone: customer.phone, stopRequested: false };
  return decideAftercareWhatsApp({
    templateName: aftercareTemplateName(template),
    optedIn: gate?.optedIn ?? false,
    stopRequested: gate?.stopRequested ?? false,
    phone: gate?.phone ?? null,
    nonProdAllowed: (e164) => isPhoneAllowed(e164),
  });
}

export async function planReviewRequests(
  admin: SupabaseClient,
  opts: { now: Date; settings?: ReviewRequestSettings },
): Promise<ReviewRequestPlan> {
  const settings = opts.settings ?? (await loadReviewRequestSettings(admin));
  const [orders, notMarkedDelivered] = await Promise.all([
    loadDueOrders(admin, opts.now, settings),
    countNotMarkedDelivered(admin, opts.now, settings),
  ]);

  const customerIds = [...new Set(orders.map((o) => o.customer_id).filter((id): id is string => Boolean(id)))];
  const asked = new Set<string>();
  if (customerIds.length > 0) {
    const { data, error } = await admin
      .from("customer_review_requests")
      .select("customer_id")
      .in("customer_id", customerIds);
    if (error) throw new Error(`customer_review_requests: ${error.message}`);
    for (const r of data ?? []) asked.add(r.customer_id as string);
  }

  const { candidates, alreadyAsked } = selectReviewRequestCandidates({ orders, asked, now: opts.now, settings });
  const planned: PlannedReviewRequest[] = [];
  if (candidates.length === 0) {
    return { settings, planned, alreadyAsked, notMarkedDelivered, pillowById: new Map() };
  }

  const { data: customers, error: customerErr } = await admin
    .from("customers")
    .select(CUSTOMER_SELECT)
    .in(
      "id",
      candidates.map((c) => c.customerId),
    );
  if (customerErr) throw new Error(`customers: ${customerErr.message}`);
  const byId = new Map(((customers ?? []) as CustomerRow[]).map((c) => [c.id, c]));

  for (const candidate of candidates) {
    const customer = byId.get(candidate.customerId);
    if (!customer) continue;
    const email = decideAftercareEmail({
      optedIn: customer.aftercare_email,
      email: candidate.order.email?.trim() || customer.email,
      allowed: (to) => isAftercareEmailAllowed(to),
    });
    const whatsapp = await decideAftercareWhatsAppFor(admin, customer);
    planned.push({ ...candidate, customer, plan: planReviewChannels(email, whatsapp) });
  }

  const pillowById = await loadPillows(
    admin,
    planned.map((p) => p.order),
  );
  return { settings, planned, alreadyAsked, notMarkedDelivered, pillowById };
}

export function aftercareAccountUrl(origin: string): string {
  const account = withLocale("/account", DEFAULT_LOCALE);
  return `${origin.replace(/\/$/, "")}${withLocale("/account/login", DEFAULT_LOCALE)}?next=${encodeURIComponent(account)}`;
}

async function renderFor(
  origin: string,
  input: { firstName: string | null; order: ReviewOrderRow; product: string; token: string },
) {
  const copy = await loadEmailCopy(REVIEW_REQUEST_EMAIL_COPY);
  return renderReviewRequestEmail(
    {
      firstName: input.firstName,
      product: input.product,
      orderNumber: input.order.order_number,
      deliveredOn: aftercareDateSgt(input.order.delivered_at!),
      reviewUrl: reviewLinkUrl(origin, input.token),
      accountUrl: aftercareAccountUrl(origin),
      supportWhatsAppDisplay: SUPPORT_WHATSAPP_DISPLAY,
      supportWhatsAppUrl: SUPPORT_WHATSAPP_URL,
    },
    copy,
  );
}

async function askOne(
  admin: SupabaseClient,
  item: PlannedReviewRequest,
  ctx: { origin: string; pillowById: PillowById; report: ReviewRequestReport },
): Promise<void> {
  const { report } = ctx;
  const token = newReviewToken();
  const { data: claim, error: claimErr } = await admin
    .from("customer_review_requests")
    .upsert(
      { customer_id: item.customerId, order_id: item.order.id, token_hash: hashReviewToken(token) },
      { onConflict: "customer_id", ignoreDuplicates: true },
    )
    .select("customer_id");
  if (claimErr) {
    report.errors.push(`${item.customerId}: claim ${claimErr.message}`);
    return;
  }
  if (!claim || claim.length === 0) {
    report.skipped.already_asked += 1;
    return;
  }
  report.asked += 1;

  const product = reviewProductLabel(goodsLines(item.order), ctx.pillowById);
  const { email, whatsapp } = item.plan;

  await Promise.all([
    email.send
      ? dispatchCustomerEmail({
          admin,
          key: { customerId: item.customerId, template: REVIEW_REQUEST_TEMPLATE, entityId: item.customerId },
          to: email.to,
          replyTo: getSupportInbox(),
          render: () => renderFor(ctx.origin, { firstName: item.customer.first_name, order: item.order, product, token }),
        }).then((out) => {
          if (out.sent) report.sent.email += 1;
          else if (out.error) {
            report.failed.email += 1;
            report.errors.push(`${item.customerId}: email failed, will retry`);
          }
        })
      : null,
    whatsapp.send
      ? notifyAftercareWhatsApp(admin, {
          customerId: item.customerId,
          template: REVIEW_REQUEST_TEMPLATE,
          entityId: item.customerId,
          ...reviewRequestTemplateParams({
            firstName: item.customer.first_name,
            orderNumber: item.order.order_number,
            product,
            deliveredAt: item.order.delivered_at!,
            token,
          }),
        }).then((out) => {
          if (out.sent) report.sent.whatsapp += 1;
          else if ("skip" in out) bump(report.whatsappSkipped, out.skip);
          else {
            report.failed.whatsapp += 1;
            report.errors.push(`${item.customerId}: whatsapp ${out.error}`);
          }
        })
      : null,
  ]);
}

type FailedEmailRow = { customer_id: string; attempts: number };

async function retryFailedEmails(
  admin: SupabaseClient,
  ctx: { origin: string; now: Date; settings: ReviewRequestSettings; report: ReviewRequestReport },
): Promise<void> {
  const { report } = ctx;
  const { data: failed, error } = await admin
    .from("customer_emails")
    .select("customer_id, attempts")
    .eq("template", REVIEW_REQUEST_TEMPLATE)
    .eq("status", "failed")
    .lt("attempts", CUSTOMER_EMAIL_MAX_ATTEMPTS)
    .limit(RETRY_BATCH);
  if (error) {
    report.errors.push(`retry: ${error.message}`);
    return;
  }
  const rows = (failed ?? []) as FailedEmailRow[];
  if (rows.length === 0) return;
  const ids = rows.map((r) => r.customer_id);

  const [requests, customers] = await Promise.all([
    admin.from("customer_review_requests").select("customer_id, order_id").in("customer_id", ids),
    admin.from("customers").select(CUSTOMER_SELECT).in("id", ids),
  ]);
  if (requests.error || customers.error) {
    report.errors.push(`retry: ${(requests.error ?? customers.error)!.message}`);
    return;
  }
  const orderIds = (requests.data ?? []).map((r) => r.order_id as string | null).filter((id): id is string => Boolean(id));
  const ordersRes =
    orderIds.length > 0
      ? await admin.from("orders").select(REVIEW_ORDER_SELECT).in("id", orderIds).eq("order_items.kind", "goods")
      : { data: [], error: null };
  if (ordersRes.error) {
    report.errors.push(`retry: ${ordersRes.error.message}`);
    return;
  }
  const orders = (ordersRes.data ?? []) as unknown as ReviewOrderRow[];
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const orderOf = new Map((requests.data ?? []).map((r) => [r.customer_id as string, r.order_id as string | null]));
  const customerById = new Map(((customers.data ?? []) as CustomerRow[]).map((c) => [c.id, c]));
  const pillowById = await loadPillows(admin, orders);

  for (const row of rows) {
    const customer = customerById.get(row.customer_id);
    const order = orderById.get(orderOf.get(row.customer_id) ?? "");
    if (!customer || !order) continue;
    const timing = reviewRequestTiming({
      deliveredAt: order.delivered_at,
      now: ctx.now,
      daysAfter: ctx.settings.daysAfter,
      maxAgeDays: ctx.settings.maxAgeDays,
    });
    if (!timing.due) continue;
    const decision = decideAftercareEmail({
      optedIn: customer.aftercare_email,
      email: order.email?.trim() || customer.email,
      allowed: (to) => isAftercareEmailAllowed(to),
    });
    if (!decision.send) continue;

    const product = reviewProductLabel(goodsLines(order), pillowById);
    const out = await dispatchCustomerEmail({
      admin,
      key: { customerId: customer.id, template: REVIEW_REQUEST_TEMPLATE, entityId: customer.id },
      to: decision.to,
      replyTo: getSupportInbox(),
      render: async () => {
        const token = newReviewToken();
        const { error: rotateErr } = await admin
          .from("customer_review_requests")
          .update({ token_hash: hashReviewToken(token) })
          .eq("customer_id", customer.id);
        if (rotateErr) throw new Error(`review link: ${rotateErr.message}`);
        return renderFor(ctx.origin, { firstName: customer.first_name, order, product, token });
      },
    });
    if (out.sent) {
      report.sent.email += 1;
      report.retried += 1;
    } else if (out.error) {
      report.failed.email += 1;
      report.errors.push(`${customer.id}: email retry failed`);
    }
  }
}

export async function runReviewRequests(
  admin: SupabaseClient,
  opts: { origin: string; now: Date; dryRun?: boolean; limit?: number },
): Promise<ReviewRequestReport> {
  const plan = await planReviewRequests(admin, { now: opts.now });
  const report = emptyReviewRequestReport(plan.settings);
  report.candidates = plan.planned.length;
  report.skipped.not_marked_delivered = plan.notMarkedDelivered;

  const reachable: PlannedReviewRequest[] = [];
  for (const item of plan.planned) {
    if (!item.plan.email.send) bump(report.emailSkipped, item.plan.email.skip);
    if (!item.plan.whatsapp.send) bump(report.whatsappSkipped, item.plan.whatsapp.skip);
    if (item.plan.any) reachable.push(item);
    else report.skipped.no_channel += 1;
  }
  report.reachable = reachable.length;

  if (opts.dryRun || reviewRequestBlock(plan.settings)) return report;

  await retryFailedEmails(admin, { origin: opts.origin, now: opts.now, settings: plan.settings, report });

  const limit = opts.limit ?? REVIEW_REQUEST_BATCH;
  report.deferred = Math.max(0, reachable.length - limit);
  for (const item of reachable.slice(0, limit)) {
    await askOne(admin, item, { origin: opts.origin, pillowById: plan.pillowById, report });
  }
  return report;
}
