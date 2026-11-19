// The Customer page's Pillow card (ADR 0042 j). Two Filling Templates named in
// the catalog's way, `Type-12` (serving L and XL, as it does in the catalog)
// and `Type-8a` (S and M), so a fitting's configuration type finds them:
//
//  - Mei (points.mjs, fittings.mjs): her latest fitting is M · T12 · M-LN, and
//    Type-12 serves no M, so the card draws it at M and says so.
//    /settings/customers/00000000-0000-4000-8000-0000000000c7
//  - Ben Ong (crm.mjs), from Shopify with no fitting: Sophie linked L · Type-12,
//    and he bought a pillow here the day after, so the card says the link is older.
//    /settings/customers/00000000-0000-4000-8000-0000000c0002
//  - Elena Goh (crm.mjs): nothing on record, so the card offers Link.
//    /settings/customers/00000000-0000-4000-8000-0000000c0005
//  - Chloe Tan (crm.mjs): Sophie re-adjusted her M · Type-8a five days ago
//    (ADR 0042 l), a 3D S in place of each side's 6D M and one more in the centre,
//    so the card draws that mix and says it was re-adjusted.
//    /settings/customers/00000000-0000-4000-8000-0000000c0003
//  - Hui Min Chua (crm.mjs): Sophie re-adjusted her S · Type-8a with a Cervical
//    Neck Support L in the centre back, nudged 40 mm to the right. The S pillow's
//    back wall curves in across the centre, and the measured roll (a made-up Neck
//    support L row below) reaches it, which once slid it into a corner whatever it
//    was nudged to (8-11-2026). Re-adjust and drag it across to see it follow.
//    /settings/customers/00000000-0000-4000-8000-0000000c0008
//
// The Profile's pillow (ADR 0042 k), as the signed-in preview user Jamie sees it
// on /account (fittings.mjs gives Jamie an L · T12 fitting):
//  - by default Jamie bought an L Premium Mpillow here, MP-20488, drawn as built;
//  - `--scenario pillow-from-shopify`: no order here, but a Migrated customer with
//    Shopify orders, so the fitting's Type-12 at L shows;
//  - `--scenario pillow-not-bought`: neither, so the Profile shows no pillow.
//
// Made-up recipes; the Items are the catalog's (fixtures/analytics.mjs): 55 6D L,
// 57 6D+ L, 60 6D+ S, 63 Cervical Neck Support L, 67 6D S, 68 6D M, 69 3D S, 73 6D Fold S.

const TYPE_12 = 512;
const TYPE_8A = 514;
const SOPHIE = "00000000-0000-4000-8000-0000000000a5";
const BEN = "00000000-0000-4000-8000-0000000c0002";
const CHLOE = "00000000-0000-4000-8000-0000000c0003";
const HUI_MIN = "00000000-0000-4000-8000-0000000c0008";
const JAMIE = "cust-preview-owner";

/** One cell's pieces, top Layer first. */
function cell(templateId, section, subSection, items, order) {
  return items.map((itemId, row) => ({
    template_id: templateId,
    section,
    sub_section: subSection,
    slot: row + 1,
    item_id: itemId,
    qty: 1,
    row_index: items.length > 1 ? row : null,
    insert_order: order + row,
    offset_x_mm: null,
    offset_y_mm: null,
  }));
}

/** A Result's build as Accept freezes it on the order line (`ResultOrderBuildSnapshot`). */
function builtPillow(resultId, size, rows) {
  return {
    result_id: resultId,
    product_type: "pillow",
    assigned_size: size,
    assigned_tier: "premium",
    assigned_length: null,
    filling_template_id: TYPE_12,
    filling_template_name: "Type-12",
    filling_placements: rows.map(({ template_id: _t, qty: _q, ...r }) => r),
    preference_lines: [],
    addon_lines: [],
    build_lines: [],
    cogs: 104,
    pricing: { goods: 580, services: 0, subtotal: 580 },
  };
}

/** A delivered Order here holding one Custom Mpillow. */
function pillowOrder({ id, number, customerId, email, days, ago, snapshot }) {
  const at = ago(days);
  return {
    order: {
      id,
      order_number: number,
      customer_id: customerId,
      email,
      status: "delivered",
      currency: "SGD",
      subtotal: 580,
      discount_amount: 0,
      shipping_amount: 0,
      tax_amount: 0,
      total: 580,
      amount_captured: 580,
      amount_refunded: 0,
      points_spent: 0,
      payment_method: "stripe",
      paid_at: at,
      delivered_at: ago(days - 4),
      created_at: at,
      updated_at: ago(days - 4),
    },
    item: {
      id: `${id}-line`,
      order_id: id,
      kind: "goods",
      variant_id: null,
      sku: `RESULT-${snapshot.assigned_size}-premium`,
      product_title: `Custom Mpillow ${snapshot.assigned_size} premium`,
      variant_title: `${snapshot.assigned_size} · premium tier`,
      quantity: 1,
      returned_quantity: 0,
      unit_price: 580,
      total_price: 580,
      unit_cost: 104,
      total_cost: 104,
      customization_snapshot: snapshot,
      created_at: at,
    },
  };
}

export default function customerPillows({ scenario, now }) {
  const ago = (days) => new Date(now.getTime() - days * 86_400_000).toISOString();
  // Jamie's pillow as built: Type-12's centre, a firmer middle on each side.
  const jamieBuild = [
    ...cell(TYPE_12, "left", "front", [55], 1),
    ...cell(TYPE_12, "left", "middle", [57, 57], 2),
    ...cell(TYPE_12, "left", "back", [69], 4),
    ...cell(TYPE_12, "center", "front", [73], 1),
    ...cell(TYPE_12, "center", "middle", [55], 2),
    ...cell(TYPE_12, "center", "back", [69, 67], 3),
    ...cell(TYPE_12, "right", "front", [55], 1),
    ...cell(TYPE_12, "right", "middle", [57, 57], 2),
    ...cell(TYPE_12, "right", "back", [69], 4),
  ];
  const orders = [
    pillowOrder({
      id: "00000000-0000-4000-8000-00000000b002",
      number: "MP-20492",
      customerId: BEN,
      email: "ben.ong@example.test",
      days: 2,
      ago,
      snapshot: builtPillow("res-preview-ben", "L", jamieBuild.slice(0, 5)),
    }),
  ];
  if (scenario !== "pillow-from-shopify" && scenario !== "pillow-not-bought") {
    orders.push(
      pillowOrder({
        id: "00000000-0000-4000-8000-00000000b001",
        number: "MP-20488",
        customerId: JAMIE,
        email: "owner@preview.local",
        days: 12,
        ago,
        snapshot: builtPillow("res-preview-jamie", "L", jamieBuild),
      }),
    );
  }
  const template = (id, name, key) => ({
    id,
    kind: "pillow",
    key,
    role: "filling",
    name,
    notes: null,
    pillow_kind: null,
    pillow_variant: null,
    is_active: true,
    created_at: ago(60),
    updated_at: ago(5),
  });
  return {
    // A Customer sign-in that is not Staff and has a pillow bought here, for the
    // configurator's "who is this one for?" question:
    // `preview shoot --as ben.ong@example.com /mp-config`.
    users: [{ id: "00000000-0000-4000-8000-000000000005", email: "ben.ong@example.com", user_metadata: { full_name: "Ben Ong" } }],
    tables: {
      bom_templates: [template(TYPE_12, "Type-12", "L"), template(TYPE_8A, "Type-8a", "S")],
      bom_template_keys: [
        { template_id: TYPE_12, key: "L", created_at: ago(60) },
        { template_id: TYPE_12, key: "XL", created_at: ago(60) },
        { template_id: TYPE_8A, key: "S", created_at: ago(60) },
        { template_id: TYPE_8A, key: "M", created_at: ago(60) },
      ],
      filling_template_placements: [
        ...cell(TYPE_12, "left", "front", [55], 1),
        ...cell(TYPE_12, "left", "middle", [57, 55], 2),
        ...cell(TYPE_12, "left", "back", [69], 4),
        ...cell(TYPE_12, "center", "front", [73], 1),
        ...cell(TYPE_12, "center", "middle", [55], 2),
        ...cell(TYPE_12, "center", "back", [69, 67], 3),
        ...cell(TYPE_12, "right", "front", [55], 1),
        ...cell(TYPE_12, "right", "middle", [57, 55], 2),
        ...cell(TYPE_12, "right", "back", [69], 4),
        ...cell(TYPE_8A, "left", "middle", [67, 68], 1),
        ...cell(TYPE_8A, "center", "middle", [68], 1),
        ...cell(TYPE_8A, "center", "back", [69], 2),
        ...cell(TYPE_8A, "right", "middle", [67, 68], 1),
      ],
      orders: orders.map((o) => o.order),
      order_items: orders.map((o) => o.item),
      migrated_customers:
        scenario === "pillow-from-shopify"
          ? [{ customer_id: JAMIE, shopify_customer_id: "7000000000042", shopify_orders_count: 3, shopify_amount_spent: 640, imported_at: ago(20) }]
          : [],
      customer_pillows: [
        {
          customer_id: BEN,
          pillow_size: "L",
          filling_template_id: TYPE_12,
          linked_by_user_id: null,
          linked_by_profile_id: SOPHIE,
          linked_at: ago(3),
        },
        {
          customer_id: CHLOE,
          pillow_size: "M",
          filling_template_id: TYPE_8A,
          // Type-8a, re-adjusted: the rows as the Re-adjust route writes them (no template_id, no qty).
          filling_placements: [
            ...cell(TYPE_8A, "left", "middle", [67, 69], 1),
            ...cell(TYPE_8A, "center", "middle", [68, 69], 1),
            ...cell(TYPE_8A, "center", "back", [69], 3),
            ...cell(TYPE_8A, "right", "middle", [67, 69], 1),
          ].map(({ template_id: _t, qty: _q, ...r }) => r),
          linked_by_user_id: null,
          linked_by_profile_id: SOPHIE,
          linked_at: ago(5),
        },
        {
          customer_id: HUI_MIN,
          pillow_size: "S",
          filling_template_id: TYPE_8A,
          // Re-adjusted with a Neck support L in the centre back, nudged across toward the right.
          filling_placements: [
            ...cell(TYPE_8A, "left", "middle", [55], 1),
            ...cell(TYPE_8A, "center", "front", [67], 1),
            ...cell(TYPE_8A, "center", "middle", [60], 2),
            ...cell(TYPE_8A, "center", "back", [63], 3).map((r) => ({ ...r, offset_x_mm: 40 })),
            ...cell(TYPE_8A, "right", "middle", [55], 1),
          ].map(({ template_id: _t, qty: _q, ...r }) => r),
          linked_by_user_id: null,
          linked_by_profile_id: SOPHIE,
          linked_at: ago(1),
        },
      ],
      // A measured Neck support L (made up): a roll thick enough to reach an S pillow's curved centre back.
      neck_support_dimension_overrides: [
        { size: "L", width_mm: 150, length_mm: 100, thickness_mm: 100, min_thickness_mm: 70, created_at: ago(30), updated_at: ago(30) },
      ],
    },
  };
}
