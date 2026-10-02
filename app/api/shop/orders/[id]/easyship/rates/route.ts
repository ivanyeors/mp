import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { loadOrderForShipping, loadOrderShipment, quoteOrderShipment } from "@/lib/shipping/order-shipment";

export const runtime = "nodejs";

/** Today's courier rates for this order — what Settings → Orders shows before buying a label. */
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

  const shipment = await loadOrderShipment(admin, id).catch(() => null);
  return NextResponse.json({
    ok: true,
    /** The courier the shopper paid for, preselected in the dialog. */
    selected_courier_service_id: shipment?.courier_service_id ?? null,
    rates: [...result.rates.rates].sort((a, b) => a.total_charge - b.total_charge),
  });
}
