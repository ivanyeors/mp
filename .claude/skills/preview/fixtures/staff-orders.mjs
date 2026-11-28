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
//   MP-20261121-0004  paid: an Mpillow Premium M built with fillings Staff adjusted, and a neck support
//                     /settings/orders/00000000-0000-4000-8000-0000005f0004
//
// Products are storefront.mjs's Cervical Neck Support; the studio is
// partner-locations.mjs's own Location.

const AISHA = "00000000-0000-4000-8000-0000000c0001";
const STUDIO = "00000000-0000-4000-8000-0000000a0006";
const NECK_M = "00000000-0000-4000-8000-00000000b003";
const NECK_L = "00000000-0000-4000-8000-00000000b004";

// Pillows and a bolster Staff can add to an order with their fillings (ADR 0057):
// active Variants of analytics.mjs's products, linked to its pillow products
// (Basic M is 3, Premium M is 8, Premium L is 9) and priced in Costings below.
const BUILT = {
  premiumM: "00000000-0000-4000-8000-0000005fb001",
  premiumL: "00000000-0000-4000-8000-0000005fb002",
  basicM: "00000000-0000-4000-8000-0000005fb003",
  bolsterM: "00000000-0000-4000-8000-0000005fb004",
};
const BOLSTER_TEMPLATE = 601;
// A second cover for size M and a second case for a medium bolster, so the build
// dialog's Cover and Case pickers (ADR 0058) each have something to choose between.
const STONE_COVER_M = 9201;
const SLATE_BOLSTER_CASE_M = 9202;

const ORDER = {
  built: "00000000-0000-4000-8000-0000005f0004",
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

  const builtVariant = (id, productId, title, price, extra) => ({
    id,
    product_id: productId,
    sku: `MP-${title.toUpperCase().replace(/\s+/g, "-")}`,
    title,
    option2: null,
    option3: null,
    price,
    compare_at_price: null,
    currency: "SGD",
    cost_price: null,
    track_inventory: true,
    weight_grams: 1800,
    image_url: null,
    is_active: true,
    item_id: null,
    pillow_product_id: null,
    ...extra,
  });
  const piece = (section, subSection, slot, itemId) => ({
    section,
    sub_section: subSection,
    slot,
    item_id: itemId,
    row_index: slot - 1,
    insert_order: null,
    offset_x_mm: null,
    offset_y_mm: null,
  });
  // Costings' "Side sleeper" (template 202) with one more 6D S in the centre back.
  const builtPlacements = [
    piece("left", "middle", 1, 68),
    piece("left", "middle", 2, 68),
    piece("center", "middle", 1, 67),
    piece("center", "back", 1, 67),
    piece("right", "middle", 1, 68),
    piece("right", "middle", 2, 68),
  ];
  const builtSnapshot = {
    source: "staff_order",
    product_type: "pillow",
    pillow_product_id: 8,
    bolster_variant: null,
    filling_template_id: null,
    filling_template_name: null,
    based_on_template: { id: 202, name: "Side sleeper" },
    filling_placements: builtPlacements,
    config_lines: [
      { item_id: 3, category: "cover", name: "Satin White", size: "M", quantity: 1, is_addon: false, price_delta: 46 },
      { item_id: 44, category: "case", name: "Deep Blue Linen", size: "M", quantity: 1, is_addon: false, price_delta: 42 },
    ],
    filling_lines: [
      { item_id: 67, subtype: "", name: "6D S", quantity: 2 },
      { item_id: 68, subtype: "", name: "6D M", quantity: 4 },
    ],
    total_addon_price: 0,
    summary: "Fillings: Adjusted from Side sleeper · 6 pieces · Cover: Satin White · Case: Deep Blue Linen",
  };

  return {
    tables: {
      product_variants: [
        builtVariant(BUILT.basicM, "prod-pillow-basic", "M", 220, { option1: "M", pillow_product_id: 3 }),
        builtVariant(BUILT.premiumM, "prod-pillow-premium", "M", 320, { option1: "M", pillow_product_id: 8 }),
        builtVariant(BUILT.premiumL, "prod-pillow-premium", "L", 340, { option1: "L", pillow_product_id: 9 }),
        builtVariant(BUILT.bolsterM, "prod-bolster", "Medium", 190, { option1: "medium" }),
      ],
      // The recipe of each: its cover and case (Satin White, Natural White Linen), and
      // the bolster's case. Premium M and L are priced by results.mjs.
      bom_lines: [
        { product_id: 3, item_id: 3, quantity: 1 },
        { product_id: 3, item_id: 8, quantity: 1 },
        { product_id: 8, item_id: 3, quantity: 1 },
        { product_id: 8, item_id: 8, quantity: 1 },
        { product_id: 9, item_id: 4, quantity: 1 },
        { product_id: 9, item_id: 9, quantity: 1 },
      ],
      bolster_bom_lines: [{ variant: "medium", item_id: 85, quantity: 1 }],
      items: [
        { id: STONE_COVER_M, name: "Stone Grey", size: "M", category: "cover", subtype: null, price_family: null, is_active: true },
        { id: SLATE_BOLSTER_CASE_M, name: "Slate", size: "M", category: "bolster_case", subtype: null, price_family: null, is_active: true },
      ],
      // Case colours, so a picked Mbolster case tints the bolster and shows its swatch.
      item_overlay_mappings: [
        { item_id: 85, color: "#c19a6b" },
        { item_id: SLATE_BOLSTER_CASE_M, color: "#64748b" },
      ],
      item_prices: [
        { item_id: STONE_COVER_M, cost_price: 16, msrp: 58, currency: "SGD" },
        { item_id: SLATE_BOLSTER_CASE_M, cost_price: 12, msrp: 40, currency: "SGD" },
      ],
      inventory_transactions: [
        { id: 920100, item_id: STONE_COVER_M, quantity_signed: 14, reason: "receive", created_at: at(30) },
        { id: 920200, item_id: SLATE_BOLSTER_CASE_M, quantity_signed: 6, reason: "receive", created_at: at(30) },
      ],
      product_prices: [
        // A Premium M in a Fibrecool case has its own Costings row, dearer than linen's.
        { key: "product:pillow:8:fibrecool", kind: "pillow", product_id: 8, variant: "fibrecool", msrp: 345, currency: "SGD" },
        { key: "product:pillow:3", kind: "pillow", product_id: 3, variant: null, msrp: 220, currency: "SGD" },
        { key: "product:bolster:medium", kind: "bolster", product_id: null, variant: "medium", msrp: 190, currency: "SGD" },
      ],
      bolster_length_config: [{ variant: "medium", default_filling_template_id: BOLSTER_TEMPLATE }],
      bom_templates: [
        {
          id: BOLSTER_TEMPLATE,
          kind: "bolster",
          key: "medium",
          role: "filling",
          name: "Medium, firm",
          notes: null,
          is_active: true,
          created_at: at(40),
          updated_at: at(40),
        },
      ],
      bom_template_keys: [{ template_id: BOLSTER_TEMPLATE, key: "medium", created_at: at(40) }],
      bolster_template_placements: [67, 67, 68, 68, 69].map((item_id, i) => ({
        template_id: BOLSTER_TEMPLATE,
        slot: i + 1,
        item_id,
      })),
      customization_configs: [
        {
          id: "00000000-0000-4000-8000-0000005fc001",
          product_type: "pillow",
          pillow_product_id: 8,
          bolster_variant: null,
          ecom_product_id: null,
          bom_template_id: null,
          config_lines: builtSnapshot.config_lines,
          filling_lines: builtSnapshot.filling_lines,
          cover_variant: "Satin White",
          case_variant: "Deep Blue Linen",
          llm_metadata: { source: "staff_order" },
          summary: builtSnapshot.summary,
          total_addon_price: 0,
          created_at: at(2),
        },
      ],
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
          id: ORDER.built,
          order_number: "MP-20261121-0004",
          status: "confirmed",
          subtotal: 355,
          shipping_amount: 0,
          total: 355,
          shipping_address: collect,
          shipping_method_id: null,
          internal_notes: "Second pillow for the guest room. Wants it a touch higher at the back than her own.",
          notes: null,
          paid_at: at(2),
          payment_reference: "pi_preview_staff_built",
          stripe_session_id: "cs_preview_staff_built",
          inventory_deducted_at: at(2),
          created_at: at(2),
          updated_at: at(2),
        },
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
        line(ORDER.built, 5, {
          variant_id: BUILT.premiumM,
          kind: "goods",
          sku: "MP-M",
          product_title: "Mpillow Premium",
          variant_title: "M",
          quantity: 1,
          unit_price: 320,
          total_price: 320,
          unit_cost: 92,
          total_cost: 92,
          customization_id: "00000000-0000-4000-8000-0000005fc001",
          customization_snapshot: builtSnapshot,
        }),
        neck(ORDER.built, 6, NECK_M, "M", 1, 35),
        neck(ORDER.payable, 1, NECK_M, "M", 1, 35),
        readjust(ORDER.payable, 2),
        neck(ORDER.paid, 3, NECK_L, "L", 1, 42),
        neck(ORDER.expired, 4, NECK_M, "M", 1, 35),
      ],
      order_payment_links: [
        {
          order_id: ORDER.built,
          token: "5a1e5a1e-0000-4000-8000-0000000f0004",
          expires_at: new Date(now.getTime() + 5 * 86_400_000).toISOString(),
          created_by: null,
          created_by_email: "owner@preview.local",
          last_sent_at: at(2),
          last_sent_to: "aisha.rahman@example.com",
          send_count: 1,
          created_at: at(2),
          updated_at: at(2),
        },
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
