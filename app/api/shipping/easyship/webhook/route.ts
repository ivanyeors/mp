import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { markOrderDeliveredByCourier, markOrderShippedByCourier } from "@/lib/ecommerce/fulfilment";
import { sendTrackingEmail } from "@/lib/email";
import {
  EASYSHIP_SIGNATURE_HEADER,
  type EasyshipWebhookEvent,
  isDeliveredStatus,
  parseEasyshipEvent,
  type TrackingStatusKey,
  trackingStatusKey,
  verifyEasyshipSignature,
} from "@/lib/shipping/easyship-webhook";
import { applyShipmentToOrder } from "@/lib/shipping/order-shipment";
import { readEasyshipConfig } from "@/lib/easyship/store";

export const runtime = "nodejs";

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
    .select("id, status, shipped_at, delivered_at, tracking_number, tracking_url, shipping_courier")
    .eq("id", shipment.order_id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) return NextResponse.json({ ok: true, ignored: "no order for this shipment" });

  try {
    switch (event.eventType) {
      case "shipment.label.created": {
        await applyShipmentToOrder(admin, order, {
          shipmentId: event.shipmentId,
          trackingNumber: event.trackingNumber,
          trackingUrl: event.trackingUrl,
          labelUrl: event.labelUrl,
        });
        return NextResponse.json({ ok: true });
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
      case "shipment.tracking.checkpoints.created":
      case "shipment.tracking.status.changed": {
        const key = trackingStatusKey(event.status);
        const shipped =
          key != null && COLLECTED.has(key)
            ? await markOrderShippedByCourier(admin, order.id as string, {
                courierStatus: event.status!,
                courierName: order.shipping_courier as string | null,
                trackingNumber: event.trackingNumber ?? (order.tracking_number as string | null),
                trackingUrl: event.trackingUrl ?? (order.tracking_url as string | null),
                shipmentId: event.shipmentId,
              })
            : false;
        let delivered: boolean | undefined;
        if (isDeliveredStatus(event.status)) {
          delivered = await markOrderDeliveredByCourier(admin, order.id as string, event.status!);
        } else {
          const update: Record<string, unknown> = { shipping_tracking_status: event.status };
          if (event.trackingNumber) update.tracking_number = event.trackingNumber;
          if (event.trackingUrl) update.tracking_url = event.trackingUrl;
          await admin.from("orders").update(update).eq("id", order.id);
        }
        if (!(shipped && key === "in_transit")) await emailStatus(admin, order.id as string, event);
        return NextResponse.json({ ok: true, shipped, ...(delivered === undefined ? {} : { delivered }) });
      }
      default:
        return NextResponse.json({ ok: true, ignored: event.eventType });
    }
  } catch (err) {
    console.error(`[easyship/webhook] ${event.eventType} for ${event.shipmentId} failed:`, err);
    return NextResponse.json({ error: "Could not apply the event" }, { status: 500 });
  }
}

const DETAIL_KEYS = new Set(["unsuccessful_delivery_attempt", "exception"]);

const COLLECTED = new Set<TrackingStatusKey>(["in_transit", "out_for_delivery", "unsuccessful_delivery_attempt", "delivered"]);

async function emailStatus(
  admin: ReturnType<typeof supabaseAdmin>,
  orderId: string,
  event: EasyshipWebhookEvent,
) {
  const key = trackingStatusKey(event.status);
  if (!key) return;
  try {
    const { settings } = await readEasyshipConfig();
    if (!settings?.tracking_email.allowed_statuses.includes(key)) return;
    const checkpointsOn =
      settings.webhook.enabled && settings.webhook.event_types.includes("shipment_tracking_checkpoints_created");
    if (event.eventType === "shipment.tracking.status.changed" && checkpointsOn && DETAIL_KEYS.has(key)) return;
    const { data: order } = await admin.from("orders").select("*").eq("id", orderId).maybeSingle();
    if (!order || !["confirmed", "processing", "shipped", "delivered"].includes(order.status)) return;
    if (order.delivered_at && key !== "delivered") return;
    await sendTrackingEmail(orderId, key, order, admin, event.checkpoint);
  } catch (err) {
    console.error(`[easyship/webhook] ${key} email for ${orderId} failed:`, err);
  }
}
