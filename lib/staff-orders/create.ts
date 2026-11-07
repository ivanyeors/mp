/**
 * Write a Staff order (ADR 0048): a pending Order with the quote's lines, its
 * courier quote, and its Payment link. Nothing is sold yet: no stock moves, no
 * coupon use is counted and no receipt goes out until Stripe charges it and the
 * shop branch of the webhook confirms it, exactly as for a shop Order.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { orderLinesCosts } from "@/lib/ecommerce/order-line-cost";
import type { StaffOrderQuote } from "@/lib/staff-orders/quote";
import { lineTotal, payLinkExpiry } from "@/lib/staff-orders/shared";

export type StaffOrderActor = { userId: string; email: string };

export type CreatedStaffOrder = {
  orderId: string;
  orderNumber: string;
  token: string;
  expiresAt: string;
};

export type CreateOutcome =
  | ({ ok: true } & CreatedStaffOrder)
  | { ok: false; status: number; error: string };

export async function createStaffOrder(
  admin: SupabaseClient,
  quote: StaffOrderQuote,
  actor: StaffOrderActor,
  now: Date = new Date(),
): Promise<CreateOutcome> {
  // Each goods line's COGS is frozen from the stock its sale takes out, as
  // checkout freezes it; a Service's from Costings, as a re-adjustment's is.
  const goods = quote.lines.filter((l) => l.kind === "goods");
  let goodsCosts: Array<{ unit_cost: number | null; total_cost: number | null }>;
  try {
    goodsCosts = await orderLinesCosts(
      admin,
      goods.map((l) => {
        const v = quote.variants.get(l.variantId) ?? null;
        return { variant: v ? { ...v, cost_price: v.cost_price } : null, quantity: l.quantity };
      }),
    );
  } catch (err) {
    return { ok: false, status: 500, error: err instanceof Error ? err.message : "Failed to load item costs" };
  }

  const { data: order, error: orderError } = await admin
    .from("orders")
    .insert({
      // The number is made by the database trigger.
      order_number: "",
      customer_id: quote.customer.id,
      email: quote.customer.email.toLowerCase().trim(),
      phone: quote.customer.phone,
      status: "pending",
      currency: quote.currency,
      subtotal: quote.subtotal,
      shipping_amount: quote.shippingAmount,
      tax_amount: quote.taxAmount,
      discount_amount: quote.discountAmount,
      total: quote.total,
      shipping_address: quote.shippingAddress,
      shipping_method_id: quote.shippingMethodId,
      ...quote.courierColumns,
      coupon_id: quote.couponId,
      coupon_code: quote.discountCode,
      notes: quote.note,
      internal_notes: quote.internalNote,
      payment_method: "stripe",
      locale: quote.customer.locale,
    })
    .select("id, order_number")
    .single();
  if (orderError || !order) {
    return { ok: false, status: 500, error: orderError?.message ?? "Failed to create the order" };
  }
  const orderId = order.id as string;
  // From here, a failure removes the Order (its lines and link cascade).
  const undo = async (error: string, status = 500): Promise<CreateOutcome> => {
    await admin.from("orders").delete().eq("id", orderId);
    return { ok: false, status, error };
  };

  let goodsIndex = 0;
  const rows = quote.lines.map((line) => {
    if (line.kind === "goods") {
      const cost = goodsCosts[goodsIndex++] ?? { unit_cost: null, total_cost: null };
      return {
        order_id: orderId,
        variant_id: line.variantId,
        kind: "goods",
        sku: line.sku,
        product_title: line.title,
        variant_title: line.variantTitle,
        image_url: line.imageUrl,
        quantity: line.quantity,
        unit_price: line.unitPrice,
        total_price: lineTotal(line),
        unit_cost: cost.unit_cost,
        total_cost: cost.total_cost,
      };
    }
    const unitCost = quote.servicePrices?.[line.serviceKey].costPrice ?? null;
    return {
      order_id: orderId,
      variant_id: null,
      kind: "service",
      service_key: line.serviceKey,
      sku: line.sku,
      product_title: line.title,
      variant_title: null,
      image_url: null,
      quantity: line.quantity,
      unit_price: line.unitPrice,
      total_price: lineTotal(line),
      unit_cost: unitCost,
      total_cost: unitCost == null ? null : Math.round(unitCost * line.quantity * 100) / 100,
    };
  });
  const { error: itemsError } = await admin.from("order_items").insert(rows);
  if (itemsError) return undo(itemsError.message);

  // The courier Staff priced and what it cost us, for the label later. Server-only;
  // a failure here must not lose the order (checkout treats it the same way).
  if (quote.shipmentQuote) {
    const { error } = await admin.from("order_shipments").insert({ order_id: orderId, ...quote.shipmentQuote });
    if (error) console.error(`[staff-order] Could not record the courier quote for ${orderId}:`, error.message);
  }

  const expiresAt = payLinkExpiry(now).toISOString();
  const { data: link, error: linkError } = await admin
    .from("order_payment_links")
    .insert({
      order_id: orderId,
      expires_at: expiresAt,
      created_by: actor.userId,
      created_by_email: actor.email,
    })
    .select("token")
    .single();
  if (linkError || !link) return undo(linkError?.message ?? "Failed to create the payment link");

  await admin.from("order_timeline").insert({
    order_id: orderId,
    event_type: "order_created",
    message: `Staff order created by ${actor.email}. Awaiting payment through its payment link.`,
    metadata: { source: "staff_order", created_by: actor.email },
  });

  return {
    ok: true,
    orderId,
    orderNumber: String(order.order_number),
    token: String(link.token),
    expiresAt,
  };
}
