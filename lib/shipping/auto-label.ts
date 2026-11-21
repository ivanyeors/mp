import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveShippingContent } from "@/lib/ecommerce/shipping";
import { easyshipConfig, type EasyshipConfig } from "@/lib/shipping/easyship";
import { loadOrderShippableLines } from "@/lib/shipping/lines";
import { isSelfCollectAddress } from "@/lib/shipping/self-collect";
import {
  buyOrderLabel,
  loadOrderForShipping,
  loadOrderShipment,
  loadOrderShippingMethod,
  orderDestination,
  preselectCourier,
  quoteOrderShipment,
} from "@/lib/shipping/order-shipment";

export type AutoLabelOutcome =
  | { made: true; courierServiceId: string }
  | { made: false; skipped: "not_connected" | "not_shippable" | "nothing_to_ship" | "has_label" }
  | { made: false; note: string };

const SHIPPABLE = new Set(["confirmed", "processing"]);
const sentence = (s: string) => s.trim().replace(/[.\s]+$/, "");

export async function autoCreateOrderLabel(
  admin: SupabaseClient,
  orderId: string,
  config: EasyshipConfig | null = easyshipConfig(),
): Promise<AutoLabelOutcome> {
  if (!config) return { made: false, skipped: "not_connected" };
  const order = await loadOrderForShipping(admin, orderId);
  if (!order || !SHIPPABLE.has(order.status) || order.shipped_at || isSelfCollectAddress(order.shipping_address)) {
    return { made: false, skipped: "not_shippable" };
  }
  const shipment = await loadOrderShipment(admin, orderId);
  if (shipment?.easyship_shipment_id) return { made: false, skipped: "has_label" };
  if ((await loadOrderShippableLines(admin, orderId, order.currency)).length === 0) {
    return { made: false, skipped: "nothing_to_ship" };
  }

  const note = async (why: string): Promise<AutoLabelOutcome> => {
    const message = `No label was made automatically: ${sentence(why)}. Make it with Create label on this order.`;
    await admin.from("order_timeline").insert({
      order_id: orderId,
      event_type: "label_not_made",
      message,
      metadata: { source: "auto" },
    });
    return { made: false, note: message };
  };

  if (!orderDestination(order)) return note("the order has no shipping address");
  const quote = await quoteOrderShipment(admin, order, config);
  if (!quote.ok) return note(quote.error);

  const method = await loadOrderShippingMethod(admin, order).catch(() => null);
  const pick = preselectCourier(quote.rates.rates, shipment?.courier_service_id, method);
  if (pick.paidForMissing) {
    return note(`${order.shipping_courier ?? "the courier the customer paid for"} is not offered for this parcel today`);
  }
  if (!pick.courierServiceId) return note("no courier offers this parcel today");
  if (pick.by !== "checkout" && pick.by !== "method") {
    return note(
      method
        ? `${resolveShippingContent(method).name} charges a flat price, so it names no courier. To make its labels automatically, set it to a live courier rate in Settings → Shipping`
        : "the customer's shipping method could not be found, so their courier is not known",
    );
  }

  const bought = await buyOrderLabel(admin, order, pick.courierServiceId, config, { auto: true });
  if (!bought.ok) {
    if (bought.status === 409) return { made: false, skipped: "has_label" };
    return note(`Easyship refused it (${sentence(bought.error)})`);
  }
  return { made: true, courierServiceId: pick.courierServiceId };
}

export async function autoCreateOrderLabelSafely(admin: SupabaseClient, orderId: string): Promise<void> {
  try {
    await autoCreateOrderLabel(admin, orderId);
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    console.error(`[auto-label] Could not make the label for ${orderId}:`, err);
    await Promise.resolve(
      admin.from("order_timeline").insert({
        order_id: orderId,
        event_type: "label_not_made",
        message: `Making the label automatically failed (${sentence(why)}). Check Easyship for a shipment for this order before making one with Create label.`,
        metadata: { source: "auto" },
      }),
    ).catch(() => {});
  }
}
