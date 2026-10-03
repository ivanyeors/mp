import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/server";
import { renderOrderEmail } from "./templates";
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

// ------------------------------------------------------------
// Transport override (primarily for tests / fake transports)
// ------------------------------------------------------------

let transportOverride: EmailTransport | null = null;

/** Override the active transport (e.g. a fake transport in tests). */
export function setEmailTransport(transport: EmailTransport | null): void {
  transportOverride = transport;
}

export function getEmailTransport(): EmailTransport {
  return transportOverride ?? getDefaultTransport();
}

// ------------------------------------------------------------
// Render + send (no persistence — easy to unit test)
// ------------------------------------------------------------

/**
 * Render a template and hand it to the transport. Throws if the transport
 * throws — callers that need resilience should use {@link dispatchOrderEmail}.
 */
export async function sendOrderEmail(
  template: EmailTemplateName,
  to: string,
  data: OrderEmailData,
  options?: { transport?: EmailTransport; from?: string }
): Promise<SendOutcome> {
  const transport = options?.transport ?? getEmailTransport();
  const rendered = renderOrderEmail(template, data);
  const result = await transport.send({
    ...rendered,
    to,
    from: options?.from ?? getDefaultFromAddress(),
  });
  return { sent: true, transport: transport.name, id: result.id };
}

// ------------------------------------------------------------
// Build provider-neutral payload from a DB order row
// ------------------------------------------------------------

interface OrderRow {
  order_number: string;
  email: string;
  currency: string;
  subtotal: number;
  shipping_amount: number;
  tax_amount: number;
  discount_amount: number;
  total: number;
  shipping_address?: {
    recipient?: string;
    line1?: string;
    line2?: string | null;
    city?: string;
    state?: string | null;
    postal_code?: string;
    country?: string;
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
  }> | null;
  order_items?: Array<{
    product_title: string;
    variant_title?: string | null;
    quantity: number;
    total_price: number;
  }> | null;
}

/** Convert a persisted order (with items) into the neutral email payload. */
export function buildOrderEmailData(
  order: OrderRow,
  extra?: { refundAmount?: number | null; trackingCheckpoint?: string | null }
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
        }
      : null,
    trackingNumber: order.tracking_number ?? null,
    trackingUrl: order.tracking_url ?? null,
    courierName: order.shipping_courier ?? null,
    minDays: order.shipping_min_days ?? null,
    maxDays: order.shipping_max_days ?? null,
    trackingCheckpoint: extra?.trackingCheckpoint ?? null,
    refundAmount: extra?.refundAmount ?? null,
  };
}

// ------------------------------------------------------------
// Idempotent dispatch (DB-backed, used by lifecycle code)
// ------------------------------------------------------------

/**
 * Send a transactional order email at most once per (order, template). The
 * `order_emails` table is used as the idempotency ledger: a unique
 * (order_id, template) row is claimed before sending, so concurrent webhook
 * retries never produce duplicate emails. Failures are logged and recorded but
 * never thrown — email must never break the webhook.
 */
export async function dispatchOrderEmail(params: {
  orderId: string;
  template: EmailTemplateName;
  to: string;
  data: OrderEmailData;
  admin?: SupabaseClient;
}): Promise<SendOutcome> {
  const admin = params.admin ?? supabaseAdmin();
  const { orderId, template, to, data } = params;

  // Claim the (order, template) slot. ignoreDuplicates => returns [] if the
  // email was already sent (or is in flight), in which case we skip.
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
    // Mark failed so a future retry can re-send (unique row stays, but the
    // operator can see the failure; lifecycle code may delete failed rows to
    // retry if desired).
    await admin
      .from("order_emails")
      .update({ status: "failed", error: message })
      .eq("id", claimId);
    return { sent: false, error: message };
  }
}

/**
 * Plan the emails to send when an order becomes confirmed. Pure mapping
 * (order -> [{template, to, data}]) so it can be asserted directly in tests.
 */
export function planOrderConfirmedEmails(
  order: OrderRow
): Array<{ template: EmailTemplateName; to: string; data: OrderEmailData }> {
  const data = buildOrderEmailData(order);
  return [
    { template: "order_confirmation", to: order.email, data },
    { template: "payment_receipt", to: order.email, data },
  ];
}

/** Send order-confirmation + payment-receipt emails (idempotent). */
export async function sendOrderConfirmedEmails(
  orderId: string,
  order: OrderRow,
  admin?: SupabaseClient
): Promise<void> {
  for (const plan of planOrderConfirmedEmails(order)) {
    await dispatchOrderEmail({ orderId, ...plan, admin });
  }
}

/** Send the shipping/tracking email (idempotent). */
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

/** Send the email for a courier status (idempotent; "in transit" is the shipped email). */
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

/** Send the refund email (idempotent). */
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
