import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { easyshipConfig, getShipment, parseShipment } from "@/lib/shipping/easyship";
import { isPendingShipmentId, loadOrderShipment } from "@/lib/shipping/order-shipment";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;

  const { id } = await params;
  const admin = supabaseAdmin();
  const [{ data: order }, shipmentRow] = await Promise.all([
    admin.from("orders").select("id, order_number").eq("id", id).maybeSingle(),
    loadOrderShipment(admin, id).catch(() => null),
  ]);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (shipmentRow?.label_url) return NextResponse.redirect(shipmentRow.label_url);

  const shipmentId = shipmentRow?.easyship_shipment_id ?? null;
  if (!shipmentId || isPendingShipmentId(shipmentId)) {
    return NextResponse.json({ error: "This order has no Easyship label yet" }, { status: 404 });
  }
  const config = easyshipConfig();
  if (!config) return NextResponse.json({ error: "Easyship is not connected" }, { status: 503 });

  let shipment;
  try {
    shipment = parseShipment(await getShipment(config, shipmentId));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not reach Easyship" },
      { status: 502 },
    );
  }
  if (shipment?.labelUrl) {
    await admin.from("order_shipments").update({ label_url: shipment.labelUrl }).eq("order_id", id);
    return NextResponse.redirect(shipment.labelUrl);
  }

  const page = Math.max(0, Number(new URL(req.url).searchParams.get("page") ?? 0) || 0);
  const encoded = shipment?.labelBase64[page];
  if (!encoded) {
    return NextResponse.json(
      { error: `The label is not ready yet (state: ${shipment?.labelState ?? "unknown"})` },
      { status: 404 },
    );
  }
  return new NextResponse(new Uint8Array(Buffer.from(encoded, "base64")), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="label-${order.order_number}${page ? `-${page + 1}` : ""}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Label-Pages": String(shipment!.labelBase64.length),
    },
  });
}
