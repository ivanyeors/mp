// Staff orders and their Payment links (ADR 0048), all made up.
//
// Aisha Rahman (crm.mjs's first Customer) has a saved address, so the Create
// order dialog's Deliver option has one to pick, and three Staff orders:
//
//   MP-20261106-0001  awaiting payment, collect at Mpillow Studio, emailed yesterday
//                     /settings/orders/00000000-0000-4000-8000-0000005f0001
//                     /pay/5a1e5a1e-0000-4000-8000-0000000f0001
//   MP-20261101-0002  paid, delivered by Standard        /pay/5a1e5a1e-0000-4000-8000-0000000f0002
//   MP-20261020-0003  link expired, still pending         /pay/5a1e5a1e-0000-4000-8000-0000000f0003
//
// Products are storefront.mjs's Cervical Neck Support; the studio is
// partner-locations.mjs's own Location.

const AISHA = "00000000-0000-4000-8000-0000000c0001";
const STUDIO = "00000000-0000-4000-8000-0000000a0006";
const NECK_M = "00000000-0000-4000-8000-00000000b003";
const NECK_L = "00000000-0000-4000-8000-00000000b004";

const ORDER = {
  payable: "00000000-0000-4000-8000-0000005f0001",
  paid: "00000000-0000-4000-8000-0000005f0002",
  expired: "00000000-0000-4000-8000-0000005f0003",
};
const TOKEN = {
  payable: "5a1e5a1e-0000-4000-8000-0000000f0001",
  paid: "5a1e5a1e-0000-4000-8000-0000000f0002",
  expired: "5a1e5a1e-0000-4000-8000-0000000f0003",
};

export default function staffOrders({ now }) {
  const at = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();

  const collect = {
    recipient: "Aisha Rahman",
    line1: "5 Fernbrook Road\n#03-01\nSingapore",
    line2: null,
    city: "Singapore",
    state: null,
    postal_code: "534999",
    country: "SG",
    collect_location: { id: STUDIO, name: "Mpillow Studio" },
  };
  const home = {
    recipient: "Aisha Rahman",
    line1: "12 Larkspur Avenue #05-11",
    city: "Singapore",
    postal_code: "459999",
    country: "SG",
  };
  const base = {
    customer_id: AISHA,
    email: "aisha.rahman@example.com",
    phone: null,
    currency: "SGD",
    tax_amount: 0,
    discount_amount: 0,
    coupon_id: null,
    coupon_code: null,
    internal_notes: "Came in for her re-adjustment; wants a spare neck support.",
    payment_method: "stripe",
    locale: "en-US",
    needs_attention: false,
    amount_refunded: 0,
  };
  const line = (orderId, n, row) => ({
    id: `00000000-0000-4000-8000-0000005f1${String(n).padStart(3, "0")}`,
    order_id: orderId,
    image_url: null,
    created_at: at(1),
    ...row,
  });
  const neck = (orderId, n, variant, title, qty, price) =>
    line(orderId, n, {
      variant_id: variant,
      kind: "goods",
      sku: `CNS-${title}`,
      product_title: "Cervical Neck Support",
      variant_title: title,
      quantity: qty,
      unit_price: price,
      total_price: qty * price,
      unit_cost: 11,
      total_cost: 11 * qty,
    });
  const readjust = (orderId, n) =>
    line(orderId, n, {
      variant_id: null,
      kind: "service",
      service_key: "readjustment",
      sku: "SERVICE-READJUSTMENT",
      product_title: "Re-adjustment service",
      variant_title: null,
      quantity: 1,
      unit_price: 30,
      total_price: 30,
      unit_cost: 9,
      total_cost: 9,
    });

  return {
    tables: {
      // A delivery method with a real (uuid) id, listed first: the Create order
      // dialog's Deliver option prices it. storefront.mjs's methods have slug ids.
      shipping_methods: [
        {
          id: "00000000-0000-4000-8000-0000005fd001",
          slug: "courier-sg",
          content: { "en-US": { name: "Courier", description: "", estimated_days: "2–3 business days" } },
          base_rate: 6,
          free_above: 120,
          currency: "SGD",
          countries: ["SG"],
          is_active: true,
          position: -1,
          rate_source: "flat",
          created_at: at(30),
          updated_at: at(30),
        },
      ],
      customer_addresses: [
        {
          id: "00000000-0000-4000-8000-0000005fa001",
          customer_id: AISHA,
          label: "Home",
          ...home,
          line2: null,
          state: null,
          phone: null,
          is_default: true,
          created_at: at(200),
          updated_at: at(200),
        },
      ],
      orders: [
        {
          ...base,
          id: ORDER.payable,
          order_number: "MP-20261106-0001",
          status: "pending",
          subtotal: 65,
          shipping_amount: 0,
          total: 65,
          shipping_address: collect,
          shipping_method_id: null,
          notes: "Your spare neck support, and today's re-adjustment. Collect it at the studio whenever suits you.",
          paid_at: null,
          stripe_session_id: null,
          created_at: at(1),
          updated_at: at(1),
        },
        {
          ...base,
          id: ORDER.paid,
          order_number: "MP-20261101-0002",
          status: "confirmed",
          subtotal: 42,
          shipping_amount: 5,
          total: 47,
          amount_captured: 47,
          shipping_address: home,
          shipping_method_id: null,
          notes: null,
          paid_at: at(5),
          inventory_deducted_at: at(5),
          payment_reference: "pi_preview_staff",
          stripe_session_id: "cs_preview_staff",
          created_at: at(6),
          updated_at: at(5),
        },
        {
          ...base,
          id: ORDER.expired,
          order_number: "MP-20261020-0003",
          status: "pending",
          subtotal: 35,
          shipping_amount: 0,
          total: 35,
          shipping_address: collect,
          shipping_method_id: null,
          notes: null,
          paid_at: null,
          stripe_session_id: null,
          created_at: at(18),
          updated_at: at(18),
        },
      ],
      order_items: [
        neck(ORDER.payable, 1, NECK_M, "M", 1, 35),
        readjust(ORDER.payable, 2),
        neck(ORDER.paid, 3, NECK_L, "L", 1, 42),
        neck(ORDER.expired, 4, NECK_M, "M", 1, 35),
      ],
      order_payment_links: [
        {
          order_id: ORDER.payable,
          token: TOKEN.payable,
          expires_at: new Date(now.getTime() + 6 * 86_400_000).toISOString(),
          created_by: null,
          created_by_email: "owner@preview.local",
          last_sent_at: at(1),
          last_sent_to: "aisha.rahman@example.com",
          send_count: 1,
          created_at: at(1),
          updated_at: at(1),
        },
        {
          order_id: ORDER.paid,
          token: TOKEN.paid,
          expires_at: new Date(now.getTime() + 1 * 86_400_000).toISOString(),
          created_by: null,
          created_by_email: "owner@preview.local",
          last_sent_at: at(6),
          last_sent_to: "aisha.rahman@example.com",
          send_count: 1,
          created_at: at(6),
          updated_at: at(6),
        },
        {
          order_id: ORDER.expired,
          token: TOKEN.expired,
          expires_at: at(11),
          created_by: null,
          created_by_email: "owner@preview.local",
          last_sent_at: at(18),
          last_sent_to: "aisha.rahman@example.com",
          send_count: 1,
          created_at: at(18),
          updated_at: at(18),
        },
      ],
      order_timeline: [
        {
          id: "00000000-0000-4000-8000-0000005f2001",
          order_id: ORDER.payable,
          event_type: "payment_link_sent",
          message: "Payment link emailed to aisha.rahman@example.com by owner@preview.local.",
          metadata: {},
          created_at: at(1),
        },
        {
          id: "00000000-0000-4000-8000-0000005f2002",
          order_id: ORDER.payable,
          event_type: "order_created",
          message: "Staff order created by owner@preview.local. Awaiting payment through its payment link.",
          metadata: { source: "staff_order" },
          created_at: at(1),
        },
      ],
    },
  };
}
