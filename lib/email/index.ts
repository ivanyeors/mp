import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import { readOrderPoints } from "@/lib/points/order";
import type { EmailCopySpec } from "./copy";
import { loadEmailCopy } from "./copy-store";
import { ORDER_EMAIL_COPY, renderOrderEmail } from "./templates";
import { getDefaultFromAddress, getDefaultTransport } from "./transport";
import type {
  EmailTemplateName,
  EmailTransport,
  OrderEmailData,
  SendOutcome,
} from "./types";

export type {
  EmailTemplateName,
  EmailTransport,
  OrderEmailData,
  OutgoingEmail,
  RenderedEmail,
  SendOutcome,
} from "./types";
export { renderOrderEmail } from "./templates";

let transportOverride: EmailTransport | null = null;

export function setEmailTransport(transport: EmailTransport | null): void {
  transportOverride = transport;
}

export function getEmailTransport(): EmailTransport {
  return transportOverride ?? getDefaultTransport();
}

export async function sendOrderEmail(
  template: EmailTemplateName,
  to: string,
  data: OrderEmailData,
  options?: { transport?: EmailTransport; from?: string }
): Promise<SendOutcome> {
  const transport = options?.transport ?? getEmailTransport();
  const copy = await loadEmailCopy(ORDER_EMAIL_COPY[template] as EmailCopySpec);
  const rendered = renderOrderEmail(template, data, copy);
  const result = await transport.send({
    ...rendered,
    to,
    from: options?.from ?? getDefaultFromAddress(),
  });
  return { sent: true, transport: transport.name, id: result.id };
}

interface OrderRow {
  order_number: string;
  email: string;
  currency: string;
  subtotal: number;
  shipping_amount: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  customer_id?: string | null;
  paid_at?: string | null;
  amount_refunded?: number | null;
  points_spent?: number | null;
  shipping_address?: {
    recipient?: string;
    line1?: string;
    line2?: string | null;
    city?: string;
    state?: string | null;
    postal_code?: string;
    country?: string;
    collect_location?: { id?: string; name?: string } | null;
  } | null;
  tracking_number?: string | null;
  tracking_url?: string | null;
  shipping_courier?: string | null;
  shipping_min_days?: number | null;
  shipping_max_days?: number | null;
  items?: Array<{
    product_title: string;
    variant_title?: string | null;
    quantity: number;
    total_price: number;
    kind?: string | null;
  }> | null;
  order_items?: Array<{
    product_title: string;
    variant_title?: string | null;
    quantity: number;
    total_price: number;
    kind?: string | null;
  }> | null;
}

export function buildOrderEmailData(
  order: OrderRow,
  extra?: {
    refundAmount?: number | null;
    trackingCheckpoint?: string | null;
    pointsEarn?: OrderEmailData["pointsEarn"];
  }
): OrderEmailData {
  const rawItems = order.items ?? order.order_items ?? [];
  const addr = order.shipping_address ?? null;

  return {
    orderNumber: order.order_number,
    customerName: addr?.recipient || order.email,
    currency: order.currency,
    items: rawItems.map((item) => ({
      title: item.product_title,
      variantTitle: item.variant_title ?? null,
      quantity: item.quantity,
      totalPrice: Number(item.total_price),
    })),
    subtotal: Number(order.subtotal),
    shippingAmount: Number(order.shipping_amount),
    taxAmount: Number(order.tax_amount),
    discountAmount: Number(order.discount_amount),
    total: Number(order.total),
    shippingAddress: addr
      ? {
          recipient: addr.recipient ?? "",
          line1: addr.line1 ?? "",
          line2: addr.line2 ?? null,
          city: addr.city ?? "",
          state: addr.state ?? null,
          postalCode: addr.postal_code ?? "",
          country: addr.country ?? "",
          collectAt: addr.collect_location?.name ?? null,
        }
      : null,
    trackingNumber: order.tracking_number ?? null,
    trackingUrl: order.tracking_url ?? null,
    courierName: order.shipping_courier ?? null,
    minDays: order.shipping_min_days ?? null,
    maxDays: order.shipping_max_days ?? null,
    trackingCheckpoint: extra?.trackingCheckpoint ?? null,
    refundAmount: extra?.refundAmount ?? null,
    pointsSpent: Number(order.points_spent ?? 0),
    pointsEarn: extra?.pointsEarn ?? null,
  };
}

export async function dispatchOrderEmail(params: {
  orderId: string;
  template: EmailTemplateName;
  to: string;
  data: OrderEmailData;
  admin?: SupabaseClient;
}): Promise<SendOutcome> {
  const admin = params.admin ?? supabaseAdmin();
  const { orderId, template, to, data } = params;

  const { data: claim, error: claimError } = await admin
    .from("order_emails")
    .upsert(
      { order_id: orderId, template, recipient: to, status: "pending" },
      { onConflict: "order_id,template", ignoreDuplicates: true }
    )
    .select("id");

  if (claimError) {
    console.error(
      `[email] Failed to claim ${template} for order ${orderId}:`,
      claimError.message
    );
    return { sent: false, error: claimError.message };
  }

  if (!claim || claim.length === 0) {
    return { sent: false, skipped: true };
  }

  const claimId = claim[0].id as string;

  try {
    const outcome = await sendOrderEmail(template, to, data);
    await admin
      .from("order_emails")
      .update({
        status: "sent",
        provider: outcome.transport ?? null,
        provider_message_id: outcome.id ?? null,
      })
      .eq("id", claimId);
    return outcome;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[email] Failed to send ${template} for order ${orderId}:`, message);
    await admin
      .from("order_emails")
      .update({ status: "failed", error: message })
      .eq("id", claimId);
    return { sent: false, error: message };
  }
}

export function planOrderConfirmedEmails(
  order: OrderRow,
  pointsEarn: OrderEmailData["pointsEarn"] = null
): Array<{ template: EmailTemplateName; to: string; data: OrderEmailData }> {
  const data = buildOrderEmailData(order, { pointsEarn });
  const lines = order.items ?? order.order_items ?? [];
  if (lines.length > 0 && lines.every((l) => l.kind === "service")) {
    return [{ template: "payment_receipt", to: order.email, data }];
  }
  return [
    { template: "order_confirmation", to: order.email, data },
    { template: "payment_receipt", to: order.email, data },
  ];
}

async function confirmationPoints(
  admin: SupabaseClient,
  orderId: string,
  order: OrderRow
): Promise<OrderEmailData["pointsEarn"]> {
  if (!order.customer_id) return null;
  try {
    const [points, customer] = await Promise.all([
      readOrderPoints(admin, {
        id: orderId,
        customer_id: order.customer_id,
        paid_at: order.paid_at ?? new Date().toISOString(),
        subtotal: Number(order.subtotal),
        discount_amount: Number(order.discount_amount),
        amount_refunded: order.amount_refunded ?? 0,
        points_spent: order.points_spent ?? 0,
      }),
      admin.from("customers").select("auth_user_id").eq("id", order.customer_id).maybeSingle(),
    ]);
    if (points.earn?.kind !== "pending") return null;
    const guest = !(customer.data as { auth_user_id: string | null } | null)?.auth_user_id;
    return { points: points.earn.points, guest };
  } catch (err) {
    console.error(`[email] Points for the confirmation of order ${orderId} could not be read:`, err);
    return null;
  }
}

export async function sendOrderConfirmedEmails(
  orderId: string,
  order: OrderRow,
  admin?: SupabaseClient
): Promise<void> {
  const client = admin ?? supabaseAdmin();
  const pointsEarn = await confirmationPoints(client, orderId, order);
  for (const plan of planOrderConfirmedEmails(order, pointsEarn)) {
    await dispatchOrderEmail({ orderId, ...plan, admin: client });
  }
}

export async function sendShippingEmail(
  orderId: string,
  order: OrderRow,
  admin?: SupabaseClient
): Promise<void> {
  await dispatchOrderEmail({
    orderId,
    template: "shipping",
    to: order.email,
    data: buildOrderEmailData(order),
    admin,
  });
}

const TRACKING_TEMPLATE = {
  in_transit: "shipping",
  out_for_delivery: "tracking_out_for_delivery",
  unsuccessful_delivery_attempt: "tracking_delivery_attempt",
  delivered: "tracking_delivered",
  exception: "tracking_exception",
} as const satisfies Record<string, EmailTemplateName>;

export async function sendTrackingEmail(
  orderId: string,
  status: keyof typeof TRACKING_TEMPLATE,
  order: OrderRow,
  admin?: SupabaseClient,
  checkpoint?: string | null
): Promise<void> {
  await dispatchOrderEmail({
    orderId,
    template: TRACKING_TEMPLATE[status],
    to: order.email,
    data: buildOrderEmailData(order, { trackingCheckpoint: checkpoint }),
    admin,
  });
}

export async function sendRefundEmail(
  orderId: string,
  order: OrderRow,
  refundAmount: number | null,
  admin?: SupabaseClient
): Promise<void> {
  await dispatchOrderEmail({
    orderId,
    template: "refund",
    to: order.email,
    data: buildOrderEmailData(order, { refundAmount }),
    admin,
  });
}
