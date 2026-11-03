import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { easyshipConfig } from "@/lib/shipping/easyship";
import {
  buyOrderLabel,
  isPendingShipmentId,
  loadOrderForShipping,
  loadOrderShipment,
  VOIDED_LABEL_STATE,
} from "@/lib/shipping/order-shipment";

export const runtime = "nodejs";

/** The order's Easyship shipment, for the Fulfillment card. Server-only data: courier cost, label. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;

  const { id } = await params;
  try {
    const shipment = await loadOrderShipment(supabaseAdmin(), id);
    return NextResponse.json({
      ok: true,
      connected: easyshipConfig() !== null,
      shipment: shipment && {
        courier_service_id: shipment.courier_service_id,
        quoted_carrier_cost: shipment.quoted_carrier_cost,
        carrier_cost: shipment.carrier_cost,
        label_state: shipment.label_state,
        /** The label was cancelled after a refund (its shipment is cleared). */
        label_voided: shipment.label_state === VOIDED_LABEL_STATE,
        /** True once a real shipment exists (not a purchase still in flight). */
        has_label: Boolean(shipment.easyship_shipment_id) && !isPendingShipmentId(shipment.easyship_shipment_id),
        purchase_pending: isPendingShipmentId(shipment.easyship_shipment_id),
        easyship_shipment_id: isPendingShipmentId(shipment.easyship_shipment_id)
          ? null
          : shipment.easyship_shipment_id,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not load the shipment" },
      { status: 500 },
    );
  }
}

const BuyLabelSchema = z.object({
  courier_service_id: z.string().trim().min(1).max(200),
});

/**
 * Make this order's label by hand, with the chosen courier: when the automatic
 * one was not made (ADR 0044). The courier's fee is charged to the Easyship account.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;

  const parsed = BuyLabelSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await params;
  const admin = supabaseAdmin();
  const order = await loadOrderForShipping(admin, id).catch(() => null);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  try {
    const result = await buyOrderLabel(admin, order, parsed.data.courier_service_id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const s = result.shipment;
    return NextResponse.json({
      ok: true,
      /** The PDF can be printed now; otherwise Easyship is still making it. */
      label_ready: Boolean(s.labelUrl || s.labelBase64.length > 0 || s.trackingNumber),
      shipment: {
        id: result.shipment.shipmentId,
        label_state: result.shipment.labelState,
        tracking_number: result.shipment.trackingNumber,
        tracking_url: result.shipment.trackingUrl,
        courier: result.shipment.courierName,
        carrier_cost: result.shipment.totalCharge,
      },
    });
  } catch (err) {
    // The label may already be bought at this point — say so, so nobody buys a second one.
    console.error(`[orders/easyship] Label purchase for ${id} failed after the Easyship call:`, err);
    return NextResponse.json(
      {
        error: `Easyship accepted the shipment but the order could not be updated: ${
          err instanceof Error ? err.message : "unknown error"
        }. Check the shipment in Easyship before retrying.`,
      },
      { status: 500 },
    );
  }
}
