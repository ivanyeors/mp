import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { resolveShippingContent } from "@/lib/ecommerce/shipping";
import {
  loadOrderForShipping,
  loadOrderShipment,
  loadOrderShippingMethod,
  preselectCourier,
  quoteOrderShipment,
} from "@/lib/shipping/order-shipment";

export const runtime = "nodejs";

/**
 * Today's courier rates for this order — what Settings → Orders shows before
 * buying a label — and the courier the customer's choice comes to, preselected.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;

  const { id } = await params;
  const admin = supabaseAdmin();
  const order = await loadOrderForShipping(admin, id).catch(() => null);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const result = await quoteOrderShipment(admin, order).catch((err: unknown) => ({
    ok: false as const,
    status: 500,
    error: err instanceof Error ? err.message : "Could not quote this order",
  }));
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  const [shipment, method] = await Promise.all([
    loadOrderShipment(admin, id).catch(() => null),
    // Without it the dialog still opens, on the cheapest courier.
    loadOrderShippingMethod(admin, order).catch((err: unknown) => {
      console.error(`[orders/easyship] Could not read the shipping method of ${id}:`, err);
      return null;
    }),
  ]);
  const rates = [...result.rates.rates].sort((a, b) => a.total_charge - b.total_charge);
  const pick = preselectCourier(rates, shipment?.courier_service_id, method);

  return NextResponse.json({
    ok: true,
    selected_courier_service_id: pick.courierServiceId,
    /** checkout: what the customer paid for · method: what their method picks today · cheapest: neither. */
    selected_by: pick.by,
    method_name: method ? resolveShippingContent(method).name : null,
    /** The courier the customer paid for, when today's rates no longer offer it. */
    paid_for_unavailable: pick.paidForMissing ? (order.shipping_courier ?? "The courier the customer chose") : null,
    rates,
  });
}
