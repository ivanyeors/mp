import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrderShipment, ShippingMethod } from "@/lib/types/ecommerce";
import {
  cancelShipment,
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
import { isSelfCollectAddress } from "@/lib/shipping/self-collect";
import { fetchCourierRates } from "@/lib/shipping/quote";
import { pickRate } from "@/lib/shipping/rates";
import { readShippingSettings } from "@/lib/shipping/settings";
import { readEasyshipConfig, readSenderAddress, readTypeBoxes } from "@/lib/easyship/store";
import type { CourierRate, RatesResult, ShippingDestination } from "@/lib/shipping/types";

const ORDER_SHIPPING_COLUMNS =
  "id, order_number, email, phone, status, currency, shipping_address, shipping_method_id, shipping_courier, shipped_at";

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
  /** Set by shop checkout. A customisation's Order names its method on its Result instead. */
  shipping_method_id?: string | null;
  shipping_courier: string | null;
  shipped_at: string | null;
};

/** The customer collects it from the studio (Self-collect): there is nothing to courier. */
const SELF_COLLECT_ERROR = "This order is collected from the studio, so it needs no courier label";

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

/**
 * The Shipping method the customer chose for an order: shop checkout stores it on
 * the order; an order made from a Result keeps it on the Result, by slug (a Paired
 * build's anchor carries it). Null when neither names one that still exists.
 */
export async function loadOrderShippingMethod(
  admin: SupabaseClient,
  order: Pick<OrderForShipping, "id" | "shipping_method_id">,
): Promise<ShippingMethod | null> {
  if (order.shipping_method_id) {
    const { data, error } = await admin
      .from("shipping_methods")
      .select("*")
      .eq("id", order.shipping_method_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as ShippingMethod | null) ?? null;
  }
  const { data: results, error: resultsError } = await admin
    .from("mp_config_responses")
    .select("id, paired_build_id, shipping_method")
    .eq("order_id", order.id);
  if (resultsError) throw new Error(resultsError.message);
  const rows = ((results ?? []) as Array<{ id: string; paired_build_id: string | null; shipping_method: string | null }>)
    .filter((r) => r.shipping_method);
  const chosen = rows.find((r) => !r.paired_build_id || r.paired_build_id === r.id) ?? rows[0];
  if (!chosen) return null;
  const { data, error } = await admin
    .from("shipping_methods")
    .select("*")
    .eq("slug", chosen.shipping_method!)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ShippingMethod | null) ?? null;
}

export type CourierPreselection = {
  /** The courier the label dialog opens on; null only when there are no rates. */
  courierServiceId: string | null;
  /**
   * Why: `checkout` is the courier the customer paid for at checkout; `method`
   * is the one their Shipping method's strategy picks from today's rates (an
   * order made from a Result records no courier); `cheapest` is neither.
   */
  by: "checkout" | "method" | "cheapest" | null;
  /** The customer paid for a courier that today's rates for this order no longer offer. */
  paidForMissing: boolean;
};

/**
 * Which courier to buy an order's label with, so the label follows the
 * customer's choice: the courier they paid for, else the courier their method
 * picks today, else the cheapest. Pure; `rates` are today's rates for the order.
 */
export function preselectCourier(
  rates: CourierRate[],
  paidFor: string | null | undefined,
  method: Pick<ShippingMethod, "rate_source" | "currency" | "easyship_strategy" | "easyship_courier_service_id"> | null,
): CourierPreselection {
  if (rates.length === 0) return { courierServiceId: null, by: null, paidForMissing: Boolean(paidFor) };
  if (paidFor && rates.some((r) => r.courier_service_id === paidFor)) {
    return { courierServiceId: paidFor, by: "checkout", paidForMissing: false };
  }
  // A courier the customer paid for that is gone today is not swapped silently:
  // the dialog says so and Staff choose. The method's pick is still the best guess.
  if (method && (method.rate_source ?? "flat") === "easyship") {
    const currency = method.currency?.toUpperCase();
    const inCurrency = rates.filter((r) => r.currency === currency);
    const picked = pickRate(
      inCurrency.length > 0 ? inCurrency : rates,
      method.easyship_strategy ?? "cheapest",
      method.easyship_courier_service_id,
    );
    if (picked) return { courierServiceId: picked.courier_service_id, by: "method", paidForMissing: Boolean(paidFor) };
  }
  const cheapest = pickRate(rates, "cheapest");
  return { courierServiceId: cheapest?.courier_service_id ?? null, by: "cheapest", paidForMissing: Boolean(paidFor) };
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
  if (isSelfCollectAddress(order.shipping_address)) return { ok: false, status: 409, error: SELF_COLLECT_ERROR };
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
 * cost go to `order_shipments`; the courier name and tracking go to the order.
 * A label does not ship the order (ADR 0044): the parcel is still on our shelf,
 * often not yet made. "Shipped", its timeline event and the shipping email come
 * from the courier's first scan, in `markOrderShippedByCourier`.
 */
export async function applyShipmentToOrder(
  admin: SupabaseClient,
  order: Pick<OrderForShipping, "id">,
  shipment: Pick<ParsedShipment, "shipmentId" | "trackingNumber" | "trackingUrl" | "labelUrl"> &
    Partial<Pick<ParsedShipment, "courierName" | "courierServiceId" | "totalCharge" | "labelState" | "minDays" | "maxDays">>,
): Promise<void> {
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
  if (shipment.minDays != null) {
    extra.shipping_min_days = shipment.minDays;
    extra.shipping_max_days = shipment.maxDays ?? shipment.minDays;
  }

  // The customer sees tracking only once the order is shipped (account pages
  // check the status), so it can be stored as soon as the label has it.
  if (shipment.trackingNumber) extra.tracking_number = shipment.trackingNumber;
  if (shipment.trackingUrl) extra.tracking_url = shipment.trackingUrl;
  if (Object.keys(extra).length > 0) {
    const { error } = await admin.from("orders").update(extra).eq("id", order.id);
    if (error) throw new Error(error.message);
  }
}

export type BuyLabelResult =
  | { ok: true; shipment: ParsedShipment }
  | { ok: false; status: number; error: string };

/**
 * Create the Easyship shipment for an order and buy its label with the chosen
 * courier: the PDF Staff print for the box. The courier's fee is charged to the
 * Easyship account. One label per order: the order is claimed before Easyship is
 * called, so a double click, two Staff at once, or Staff racing the automatic
 * label cannot buy two.
 */
export async function buyOrderLabel(
  admin: SupabaseClient,
  order: OrderForShipping,
  courierServiceId: string,
  config: EasyshipConfig | null = easyshipConfig(),
  opts: { auto?: boolean } = {},
): Promise<BuyLabelResult> {
  if (!config) return { ok: false, status: 503, error: "Easyship is not connected (EASYSHIP_API_TOKEN is not set)" };
  if (!SHIPPABLE_STATUSES.has(order.status)) {
    return { ok: false, status: 409, error: `An order that is ${order.status} cannot be shipped` };
  }
  if (isSelfCollectAddress(order.shipping_address)) return { ok: false, status: 409, error: SELF_COLLECT_ERROR };
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

  const courier = shipment.courierName ?? courierServiceId;
  const ready = shipment.labelUrl || shipment.labelBase64.length > 0 || shipment.trackingNumber;
  await admin.from("order_timeline").insert({
    order_id: order.id,
    event_type: "shipment_created",
    message: ready
      ? `${opts.auto ? "Label made automatically" : "Label made"} with ${courier}. Print it from this order.`
      : `${opts.auto ? "Label requested automatically" : "Label requested"} with ${courier}; Easyship is still making it.`,
    metadata: {
      easyship_shipment_id: shipment.shipmentId,
      courier_service_id: shipment.courierServiceId ?? courierServiceId,
      label_state: shipment.labelState,
      carrier_cost: shipment.totalCharge,
      ...(opts.auto ? { source: "auto" } : {}),
    },
  });

  // After the "created" event, so the timeline reads in the order things happened.
  await applyShipmentToOrder(admin, order, {
    ...shipment,
    courierServiceId: shipment.courierServiceId ?? courierServiceId,
  });

  return { ok: true, shipment };
}

/** `order_shipments.label_state` once the label is cancelled; the shipment id is cleared with it. */
export const VOIDED_LABEL_STATE = "voided";

/**
 * Cancel a refunded order's label in Easyship, so the courier fee comes back
 * (ADR 0044: labels are made at payment, so a refunded order can hold one). Only
 * while the courier has not collected the parcel. Never throws: what happened, or
 * what Staff must do in Easyship, goes on the order's timeline.
 */
export async function cancelOrderLabel(
  admin: SupabaseClient,
  orderId: string,
  config: EasyshipConfig | null = easyshipConfig(),
): Promise<{ cancelled: boolean }> {
  const shipment = await loadOrderShipment(admin, orderId).catch(() => null);
  const shipmentId = shipment?.easyship_shipment_id;
  if (!shipmentId || isPendingShipmentId(shipmentId)) return { cancelled: false };
  const { data: order } = await admin.from("orders").select("shipped_at").eq("id", orderId).maybeSingle();
  // With the courier already: there is no label left to void.
  if (order?.shipped_at) return { cancelled: false };

  const note = (event_type: string, message: string) =>
    admin.from("order_timeline").insert({
      order_id: orderId,
      event_type,
      message,
      metadata: { easyship_shipment_id: shipmentId, source: "easyship" },
    });

  if (!config) {
    await note("label_not_cancelled", `The order was refunded but still has a label. Cancel shipment ${shipmentId} in Easyship to get the courier fee back.`);
    return { cancelled: false };
  }
  try {
    await cancelShipment(config, shipmentId);
  } catch (err) {
    const why = err instanceof Error ? err.message : "Easyship request failed";
    await note(
      "label_not_cancelled",
      `The order was refunded, but its label could not be cancelled (${why}). Cancel shipment ${shipmentId} in Easyship to get the courier fee back, and do not send the parcel.`,
    );
    return { cancelled: false };
  }
  // Forget the void label, so it cannot be printed and an order reinstated later
  // (a dispute won) can get a new one. The timeline keeps the shipment id.
  await admin
    .from("order_shipments")
    .update({ easyship_shipment_id: null, label_url: null, carrier_cost: null, label_state: VOIDED_LABEL_STATE })
    .eq("order_id", orderId)
    .eq("easyship_shipment_id", shipmentId);
  await note("label_cancelled", "Label cancelled in Easyship because the order was refunded. Easyship refunds the courier fee to the account.");
  return { cancelled: true };
}
