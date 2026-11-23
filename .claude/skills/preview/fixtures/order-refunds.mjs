// Two paid Orders for the order screen's refund dialog. Every name, figure and
// address is made up.
//
// - MP2001, a shop Order: two satin covers and a linen case, S$12.50 off with
//   a code, S$8 shipping, S$120.50 paid on one card charge. Delivered.
// - MP2002, a customised (Result) Order, in production: a premium pillow and
//   its measurement, paid on a hold plus a Balance payment.
//
// Both carry cost at sale and an order_margins row, as the view would compute
// it, so the order screen shows Unit cost and Realized margin to a role with
// Costings.

const SHOP = "0f0f0f0f-0000-4000-8000-000000002001";
const RESULT = "0f0f0f0f-0000-4000-8000-000000002002";

export default function orderRefunds({ now }) {
  const day = 86400e3;
  const t = (daysAgo) => new Date(now.getTime() - daysAgo * day).toISOString();
  const address = { name: "Tan Mei Ling", line1: "12 Example Road", city: "Singapore", postal_code: "000000", country: "SG" };

  const base = {
    currency: "SGD",
    tax_amount: 0,
    points_spent: 0,
    shipping_address: address,
    billing_address: null,
    customer_id: null,
    coupon_id: null,
    notes: null,
    internal_notes: null,
    payment_method: "stripe",
    amount_refunded: 0,
    needs_attention: false,
    locale: "en-US",
    phone: null,
  };

  return {
    tables: {
      orders: [
        {
          ...base,
          id: SHOP,
          order_number: "MP2001",
          email: "mei.ling@example.com",
          status: "delivered",
          subtotal: 125,
          discount_amount: 12.5,
          coupon_code: "WELCOME10",
          shipping_amount: 8,
          total: 120.5,
          amount_captured: 120.5,
          payment_reference: "pi_preview_shop",
          paid_at: t(9),
          inventory_deducted_at: t(9),
          shipped_at: t(7),
          delivered_at: t(5),
          created_at: t(9),
          updated_at: t(5),
        },
        {
          ...base,
          id: RESULT,
          order_number: "MP2002",
          email: "arjun.k@example.com",
          status: "processing",
          subtotal: 510,
          discount_amount: 0,
          coupon_code: null,
          shipping_amount: 0,
          total: 510,
          amount_captured: 510,
          payment_reference: "pi_preview_hold",
          paid_at: t(3),
          shipped_at: null,
          delivered_at: null,
          created_at: t(3),
          updated_at: t(3),
        },
      ],
      order_items: [
        {
          id: "0f0f0f0f-1000-4000-8000-000000002011",
          order_id: SHOP,
          kind: "goods",
          sku: "COV-SAT-M",
          product_title: "Satin White Cover",
          variant_title: "Size M",
          quantity: 2,
          returned_quantity: 0,
          unit_price: 45,
          total_price: 90,
          unit_cost: 12,
          total_cost: 24,
          created_at: t(9),
        },
        {
          id: "0f0f0f0f-1000-4000-8000-000000002012",
          order_id: SHOP,
          kind: "goods",
          sku: "CASE-LIN-M",
          product_title: "Natural White Linen Pillow Case",
          variant_title: "Size M",
          quantity: 1,
          returned_quantity: 0,
          unit_price: 35,
          total_price: 35,
          unit_cost: 9,
          total_cost: 9,
          created_at: t(9),
        },
        {
          id: "0f0f0f0f-1000-4000-8000-000000002021",
          order_id: RESULT,
          kind: "goods",
          sku: "RESULT-PREMIUM-M",
          product_title: "Customised Mpillow M",
          variant_title: "Premium",
          quantity: 1,
          returned_quantity: 0,
          unit_price: 460,
          total_price: 460,
          unit_cost: 92,
          total_cost: 92,
          customization_snapshot: {
            result_id: "res_preview_refund",
            product_type: "pillow",
            assigned_size: "M",
            assigned_tier: "premium",
            build_lines: [{ item_id: 3, quantity: 1, role: "cover", name: "Satin White Cover M" }],
          },
          created_at: t(3),
        },
        {
          id: "0f0f0f0f-1000-4000-8000-000000002022",
          order_id: RESULT,
          kind: "service",
          service_key: "measurement_premium",
          sku: "SVC-MEASURE-PREMIUM",
          product_title: "Premium measurement",
          variant_title: null,
          quantity: 1,
          returned_quantity: 0,
          unit_price: 50,
          total_price: 50,
          unit_cost: 12,
          total_cost: 12,
          created_at: t(3),
        },
      ],
      order_payments: [
        { id: "pay_preview_shop", order_id: SHOP, type: "charge", amount: 120.5, currency: "SGD", stripe_object_id: "pi_preview_shop", metadata: {}, occurred_at: t(9), created_at: t(9) },
        { id: "pay_preview_hold", order_id: RESULT, type: "charge", amount: 400, currency: "SGD", stripe_object_id: "pi_preview_hold", metadata: {}, occurred_at: t(3), created_at: t(3) },
        { id: "pay_preview_topup", order_id: RESULT, type: "charge", amount: 110, currency: "SGD", stripe_object_id: "pi_preview_topup", metadata: {}, occurred_at: t(3), created_at: t(3) },
      ],
      order_margins: [
        { order_id: SHOP, order_number: "MP2001", revenue: 125, discount: 12.5, shipping: 8, tax: 0, cogs: 33, net_revenue: 120.5, gross_margin: 79.5, margin_pct: 70.67 },
        { order_id: RESULT, order_number: "MP2002", revenue: 510, discount: 0, shipping: 0, tax: 0, cogs: 104, net_revenue: 510, gross_margin: 406, margin_pct: 79.61 },
      ],
      order_timeline: [
        { id: "tl_preview_1", order_id: SHOP, event_type: "paid", message: "Payment received via Stripe", metadata: {}, created_at: t(9) },
        { id: "tl_preview_2", order_id: SHOP, event_type: "delivered", message: "Delivered", metadata: {}, created_at: t(5) },
        { id: "tl_preview_3", order_id: RESULT, event_type: "paid", message: "Hold captured and Balance payment received", metadata: {}, created_at: t(3) },
      ],
    },
  };
}
