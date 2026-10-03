import type { SupabaseClient } from "@supabase/supabase-js";
import { markOrderShipped } from "@/lib/ecommerce/fulfilment";
import type { OrderShipment } from "@/lib/types/ecommerce";
import {
  createShipment,
  easyshipConfig,
  EasyshipError,
  parseShipment,
  shipmentRequestBody,
  type EasyshipConfig,
  type ParsedShipment,
} from "@/lib/shipping/easyship";
import { loadOrderShippableLines } from "@/lib/shipping/lines";
import { buildParcels } from "@/lib/shipping/parcels";
import { fetchCourierRates } from "@/lib/shipping/quote";
import { readShippingSettings } from "@/lib/shipping/settings";
import { readEasyshipConfig, readSenderAddress, readTypeBoxes } from "@/lib/easyship/store";
import type { RatesResult, ShippingDestination } from "@/lib/shipping/types";

const ORDER_SHIPPING_COLUMNS =
  "id, order_number, email, phone, status, currency, shipping_address, shipping_courier, shipped_at";

export type OrderForShipping = {
  id: string;
  order_number: string;
  email: string;
  phone: string | null;
  status: string;
  currency: string;
  shipping_address: {
    recipient?: string;
    line1?: string;
    line2?: string | null;
    city?: string;
    state?: string | null;
    postal_code?: string;
    country?: string;
    phone?: string | null;
  } | null;
  shipping_courier: string | null;
  shipped_at: string | null;
};

/** Orders that can still get a label: paid, not yet shipped, not unwound. */
const SHIPPABLE_STATUSES = new Set(["confirmed", "processing"]);

/** A label purchase in flight holds the shipment id as `pending:<uuid>`. */
export function isPendingShipmentId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith("pending:");
}

export async function loadOrderForShipping(
  admin: SupabaseClient,
  orderId: string,
): Promise<OrderForShipping | null> {
  const { data, error } = await admin.from("orders").select(ORDER_SHIPPING_COLUMNS).eq("id", orderId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OrderForShipping | null) ?? null;
}

export async function loadOrderShipment(admin: SupabaseClient, orderId: string): Promise<OrderShipment | null> {
  const { data, error } = await admin.from("order_shipments").select("*").eq("order_id", orderId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as OrderShipment | null) ?? null;
}

export function orderDestination(order: OrderForShipping): ShippingDestination | null {
  const a = order.shipping_address;
  if (!a?.country || !a.postal_code) return null;
  return {
    country: a.country,
    postal_code: a.postal_code,
    city: a.city ?? null,
    state: a.state ?? null,
    line1: a.line1 ?? null,
    line2: a.line2 ?? null,
  };
}

export type OrderRatesResult =
  | { ok: true; rates: Extract<RatesResult, { ok: true }> }
  | { ok: false; status: number; error: string };

/** Today's courier rates for an order's parcels — what the label will actually cost. */
/** An invalid saved doc reads as "no boxes, no sender"; name the real cause instead. */
async function invalidCourierDoc(): Promise<string | null> {
  const { settingsError } = await readEasyshipConfig();
  return settingsError ? `The saved courier settings are invalid (${settingsError}): fix them in Settings → Shipping → Couriers` : null;
}

export async function quoteOrderShipment(
  admin: SupabaseClient,
  order: OrderForShipping,
  config: EasyshipConfig | null = easyshipConfig(),
): Promise<OrderRatesResult> {
  if (!config) return { ok: false, status: 503, error: "Easyship is not connected (EASYSHIP_API_TOKEN is not set)" };
  const destination = orderDestination(order);
  if (!destination) return { ok: false, status: 400, error: "This order has no shipping address" };

  const [settings, boxes] = await Promise.all([readShippingSettings(), readTypeBoxes()]);
  const lines = await loadOrderShippableLines(admin, order.id, order.currency);
  const rates = await fetchCourierRates(admin, {
    settings,
    destination,
    parcels: buildParcels(lines, boxes),
    currency: order.currency,
    fresh: true,
    config,
  });
  if (!rates.ok) {
    return { ok: false, status: rates.reason === "error" ? 502 : 400, error: rates.message };
  }
  return { ok: true, rates };
}

/**
 * Write what Easyship knows about a shipment onto its order. The label and its
 * cost go to `order_shipments`; the courier name, and — the first time a tracking
 * number exists — tracking, "shipped", the timeline event and the shipping email
 * go to the order. That first time is at purchase for a synchronous label, or
 * later from the label webhook.
 */
export async function applyShipmentToOrder(
  admin: SupabaseClient,
  order: Pick<OrderForShipping, "id" | "shipped_at" | "status">,
  shipment: Pick<ParsedShipment, "shipmentId" | "trackingNumber" | "trackingUrl" | "labelUrl"> &
    Partial<Pick<ParsedShipment, "courierName" | "courierServiceId" | "totalCharge" | "labelState">>,
): Promise<{ shipped: boolean }> {
  const shipmentRow: Record<string, unknown> = {
    order_id: order.id,
    easyship_shipment_id: shipment.shipmentId,
  };
  if (shipment.labelUrl) shipmentRow.label_url = shipment.labelUrl;
  if (shipment.labelState) shipmentRow.label_state = shipment.labelState;
  if (shipment.totalCharge != null) shipmentRow.carrier_cost = shipment.totalCharge;
  if (shipment.courierServiceId) shipmentRow.courier_service_id = shipment.courierServiceId;
  const { error: shipmentError } = await admin
    .from("order_shipments")
    .upsert(shipmentRow, { onConflict: "order_id" });
  if (shipmentError) throw new Error(shipmentError.message);

  const extra: Record<string, unknown> = {};
  if (shipment.courierName) extra.shipping_courier = shipment.courierName;

  const alreadyShipped = order.shipped_at != null || !SHIPPABLE_STATUSES.has(order.status);
  if (shipment.trackingNumber && !alreadyShipped) {
    const result = await markOrderShipped(admin, order.id, {
      trackingNumber: shipment.trackingNumber,
      trackingUrl: shipment.trackingUrl,
      extra,
      message: `Shipped with ${shipment.courierName ?? "Easyship"}. Tracking: ${shipment.trackingNumber}`,
      metadata: { source: "easyship", easyship_shipment_id: shipment.shipmentId },
    });
    if (!result.ok) throw new Error(result.error);
    return { shipped: true };
  }

  if (shipment.trackingNumber) extra.tracking_number = shipment.trackingNumber;
  if (shipment.trackingUrl) extra.tracking_url = shipment.trackingUrl;
  if (Object.keys(extra).length > 0) {
    const { error } = await admin.from("orders").update(extra).eq("id", order.id);
    if (error) throw new Error(error.message);
  }
  return { shipped: false };
}

export type BuyLabelResult =
  | { ok: true; shipment: ParsedShipment; shipped: boolean }
  | { ok: false; status: number; error: string };

/**
 * Create the Easyship shipment for an order and buy its label with the chosen
 * courier. One label per order: the order is claimed before Easyship is called,
 * so a double click or two Staff at once cannot buy two.
 */
export async function buyOrderLabel(
  admin: SupabaseClient,
  order: OrderForShipping,
  courierServiceId: string,
  config: EasyshipConfig | null = easyshipConfig(),
): Promise<BuyLabelResult> {
  if (!config) return { ok: false, status: 503, error: "Easyship is not connected (EASYSHIP_API_TOKEN is not set)" };
  if (!SHIPPABLE_STATUSES.has(order.status)) {
    return { ok: false, status: 409, error: `An order that is ${order.status} cannot be shipped` };
  }
  const destination = orderDestination(order);
  if (!destination) return { ok: false, status: 400, error: "This order has no shipping address" };

  const [settings, boxes] = await Promise.all([readShippingSettings(), readTypeBoxes()]);
  const lines = await loadOrderShippableLines(admin, order.id, order.currency);
  const parcels = buildParcels(lines, boxes);
  if (!parcels || parcels.length === 0) {
    return { ok: false, status: 400, error: (await invalidCourierDoc()) ?? "This order cannot be boxed for a label" };
  }
  // The same default sender the quote used.
  const origin = await readSenderAddress();
  if (!origin) {
    return {
      ok: false,
      status: 400,
      error: (await invalidCourierDoc()) ?? "No default sender address: set one in Settings → Shipping → Couriers → Addresses",
    };
  }

  // Claim: make sure the row exists, then take it only while it has no shipment.
  // The guarded update succeeds for one request; every other one sees 409.
  const { error: rowError } = await admin
    .from("order_shipments")
    .upsert({ order_id: order.id }, { onConflict: "order_id", ignoreDuplicates: true });
  if (rowError) return { ok: false, status: 500, error: rowError.message };
  const claim = `pending:${crypto.randomUUID()}`;
  const { data: claimed, error: claimError } = await admin
    .from("order_shipments")
    .update({ easyship_shipment_id: claim })
    .eq("order_id", order.id)
    .is("easyship_shipment_id", null)
    .select("order_id");
  if (claimError) return { ok: false, status: 500, error: claimError.message };
  if (!claimed?.length) return { ok: false, status: 409, error: "This order already has an Easyship shipment" };

  const release = () =>
    admin
      .from("order_shipments")
      .update({ easyship_shipment_id: null })
      .eq("order_id", order.id)
      .eq("easyship_shipment_id", claim);

  let shipment: ParsedShipment | null;
  try {
    const raw = await createShipment(
      config,
      shipmentRequestBody({
        settings,
        origin,
        destination,
        contact: {
          name: order.shipping_address?.recipient || order.email,
          email: order.email,
          phone: order.shipping_address?.phone ?? order.phone,
        },
        parcels,
        courierServiceId,
        orderNumber: order.order_number,
        courierName: order.shipping_courier,
      }),
    );
    shipment = parseShipment(raw);
  } catch (err) {
    await release();
    const status = err instanceof EasyshipError && err.status && err.status < 500 ? 400 : 502;
    return { ok: false, status, error: err instanceof Error ? err.message : "Easyship request failed" };
  }
  if (!shipment) {
    await release();
    return { ok: false, status: 502, error: "Easyship did not return a shipment" };
  }

  await admin.from("order_timeline").insert({
    order_id: order.id,
    event_type: "shipment_created",
    message: shipment.trackingNumber
      ? `Easyship label bought (${shipment.courierName ?? courierServiceId}).`
      : `Easyship shipment ${shipment.shipmentId} created; the label is being generated.`,
    metadata: {
      easyship_shipment_id: shipment.shipmentId,
      courier_service_id: shipment.courierServiceId ?? courierServiceId,
      label_state: shipment.labelState,
      carrier_cost: shipment.totalCharge,
    },
  });

  // After the "created" event, so the timeline reads in the order things happened.
  const { shipped } = await applyShipmentToOrder(admin, order, {
    ...shipment,
    courierServiceId: shipment.courierServiceId ?? courierServiceId,
  });

  return { ok: true, shipment, shipped };
}
