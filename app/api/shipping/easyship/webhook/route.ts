import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { markOrderDeliveredByCourier } from "@/lib/ecommerce/fulfilment";
import { sendTrackingEmail } from "@/lib/email";
import {
  EASYSHIP_SIGNATURE_HEADER,
  isDeliveredStatus,
  parseEasyshipEvent,
  trackingStatusKey,
  verifyEasyshipSignature,
} from "@/lib/shipping/easyship-webhook";
import { applyShipmentToOrder } from "@/lib/shipping/order-shipment";
import { readEasyshipConfig } from "@/lib/easyship/store";

export const runtime = "nodejs";

/**
 * Easyship → order updates. Register this URL in Easyship (Connect → API
 * Integrations → Webhooks) for `shipment.label.created`, `shipment.label.failed`
 * and `shipment.tracking.status.changed`.
 *
 * Fails closed: without a secret (EASYSHIP_WEBHOOK_SECRET, else the one captured
 * when Settings → Easyship registered the webhook) nothing is accepted. Every write
 * is idempotent — a repeated label event changes nothing and sends no second
 * email; a repeated "Delivered" never moves `delivered_at`.
 */
export async function POST(req: Request) {
  const secret =
    process.env.EASYSHIP_WEBHOOK_SECRET?.trim() || (await readEasyshipConfig()).sync.webhook_secret_token?.trim();
  if (!secret) {
    return NextResponse.json({ error: "Easyship webhooks are not configured" }, { status: 503 });
  }
  if (!verifyEasyshipSignature(req.headers.get(EASYSHIP_SIGNATURE_HEADER), secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = parseEasyshipEvent(await req.json().catch(() => null));
  // Acknowledge what we do not handle, so Easyship does not retry it forever.
  if (!event) return NextResponse.json({ ok: true, ignored: "unrecognised event" });

  const admin = supabaseAdmin();
  const { data: shipment, error: shipmentError } = await admin
    .from("order_shipments")
    .select("order_id")
    .eq("easyship_shipment_id", event.shipmentId)
    .maybeSingle();
  if (shipmentError) return NextResponse.json({ error: shipmentError.message }, { status: 500 });
  if (!shipment) return NextResponse.json({ ok: true, ignored: "no order for this shipment" });

  const { data: order, error } = await admin
    .from("orders")
    .select("id, status, shipped_at, delivered_at")
    .eq("id", shipment.order_id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) return NextResponse.json({ ok: true, ignored: "no order for this shipment" });

  try {
    switch (event.eventType) {
      case "shipment.label.created": {
        const { shipped } = await applyShipmentToOrder(admin, order, {
          shipmentId: event.shipmentId,
          trackingNumber: event.trackingNumber,
          trackingUrl: event.trackingUrl,
          labelUrl: event.labelUrl,
        });
        return NextResponse.json({ ok: true, shipped });
      }
      case "shipment.label.failed": {
        await admin.from("order_timeline").insert({
          order_id: order.id,
          event_type: "shipment_failed",
          message: "Easyship could not generate the label. Check the shipment in Easyship.",
          metadata: { easyship_shipment_id: event.shipmentId, source: "easyship" },
        });
        return NextResponse.json({ ok: true });
      }
      case "shipment.tracking.status.changed": {
        let delivered: boolean | undefined;
        if (isDeliveredStatus(event.status)) {
          delivered = await markOrderDeliveredByCourier(admin, order.id as string, event.status!);
        } else {
          const update: Record<string, unknown> = { shipping_tracking_status: event.status };
          if (event.trackingNumber) update.tracking_number = event.trackingNumber;
          if (event.trackingUrl) update.tracking_url = event.trackingUrl;
          await admin.from("orders").update(update).eq("id", order.id);
        }
        await emailStatus(admin, order.id as string, event.status);
        return NextResponse.json({ ok: true, ...(delivered === undefined ? {} : { delivered }) });
      }
      default:
        return NextResponse.json({ ok: true, ignored: event.eventType });
    }
  } catch (err) {
    console.error(`[easyship/webhook] ${event.eventType} for ${event.shipmentId} failed:`, err);
    // 500 so Easyship retries; every handler above is safe to run twice.
    return NextResponse.json({ error: "Could not apply the event" }, { status: 500 });
  }
}

/** Emails the customer, in our template, for the statuses ticked under Couriers › Tracking. Never throws. */
async function emailStatus(admin: ReturnType<typeof supabaseAdmin>, orderId: string, status: string | null) {
  const key = trackingStatusKey(status);
  if (!key) return;
  try {
    const { settings } = await readEasyshipConfig();
    if (!settings?.tracking_email.allowed_statuses.includes(key)) return;
    const { data: order } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
    if (order) await sendTrackingEmail(orderId, key, order, admin);
  } catch (err) {
    console.error(`[easyship/webhook] ${key} email for ${orderId} failed:`, err);
  }
}
