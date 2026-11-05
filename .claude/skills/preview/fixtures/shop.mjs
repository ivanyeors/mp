// Sample prices and products for the Inventory → Costings → Products → In the
// shop path (Settings → Inventory, Costings, Products). Item ids below are the
// catalog's in `analytics.mjs`. Every price is made up.
//
// What it shows:
// - Most covers, cases, protectors and accessories have a cost and an MSRP;
//   fillings and packaging have a cost. The services under "other" have none.
// - "Colored" bolster case (25) has neither, and Deep Blue Linen L (45) has no
//   cost, so Inventory offers "Add cost in Costings" for them.
// - "Silk Travel Pouch" (9101) was just added to Inventory with no prices.
// - Satin White Cover is pushed to Products as a draft (not in the shop);
//   Waterproof Inner Pillow Protector is pushed and in the shop.
// - Cervical Neck Support XS (66) joined Inventory after its family's product,
//   so Inventory offers to add it.

const MSRP_BY_ITEM = {
  // Satin White cover, XS to XL
  1: 38, 2: 42, 3: 46, 4: 50, 5: 54,
  // Natural White Linen pillow case, XS to XL
  6: 34, 7: 38, 8: 42, 9: 46, 10: 50,
  // Fibrecool pillow case, S / L / M
  33: 40, 36: 48, 53: 44,
  // Deep Blue Linen pillow case, S to L
  43: 38, 44: 42, 45: 46,
  // Waterproof Inner pillow protector, XS to XL
  11: 24, 12: 26, 13: 28, 14: 30, 15: 32,
  // Camel bolster case, S to L
  64: 28, 85: 32, 86: 36,
  // Bolster protectors
  26: 22, 84: 26,
  // Accessories
  41: 60, 61: 38, 62: 38, 63: 45, 66: 34, 93: 120,
};

const COST_BY_ITEM = {
  1: 12, 2: 13, 3: 14, 4: 15, 5: 16,
  6: 11, 7: 12, 8: 13, 9: 14, 10: 15,
  33: 14, 36: 17, 53: 15,
  43: 12, 44: 13,
  11: 7.5, 12: 8, 13: 8.5, 14: 9, 15: 9.5,
  64: 9, 85: 10, 86: 11,
  26: 6, 84: 7,
  41: 15, 61: 10, 62: 10, 63: 10, 66: 9, 93: 48,
};

// Build inputs (fillings, packaging) only need a cost; these are made up too.
const BUILD_INPUT_COST = {
  21: 0.4, 22: 0.6, 23: 0.8, 24: 1.1,
  55: 3.2, 57: 3.8, 60: 3.6, 67: 2.9, 68: 3.0, 69: 2.2, 70: 2.6, 72: 3.4, 73: 3.4, 74: 3.5,
  75: 0.2, 76: 0.3,
};

const CATEGORY_ACCESSORIES = "00000000-0000-4000-8000-00000000c001";

/** A product pushed from Inventory: one Variant per size, priced from Costings. */
function pushedProduct({ id, slug, title, status, itemIds, sizes, now }) {
  const at = new Date(now.getTime() - 3 * 86_400_000).toISOString();
  return {
    product: {
      id,
      slug,
      product_type: "accessory",
      status,
      is_auto_generated: true,
      category_id: CATEGORY_ACCESSORIES,
      tags: ["inventory"],
      content: { "en-US": { title, description: "" } },
      featured: false,
      published_at: status === "active" ? at : null,
      created_at: at,
      updated_at: at,
    },
    options: [{ id: `${id}-opt`, product_id: id, name: "Size", position: 1, values: sizes }],
    variants: itemIds.map((itemId, position) => ({
      id: `${id}-v${position}`,
      product_id: id,
      item_id: itemId,
      price_key: `item:${itemId}`,
      pillow_product_id: null,
      title: sizes[position],
      option1: sizes[position],
      sku: `ITEM-${itemId}`,
      price: MSRP_BY_ITEM[itemId],
      cost_price: COST_BY_ITEM[itemId],
      currency: "SGD",
      track_inventory: true,
      is_active: true,
      position,
    })),
  };
}

export default function shop({ now }) {
  const costs = { ...COST_BY_ITEM, ...BUILD_INPUT_COST };
  const priced = new Set([...Object.keys(MSRP_BY_ITEM), ...Object.keys(costs)].map(Number));
  const pushed = [
    pushedProduct({
      id: "00000000-0000-4000-8000-00000000d001",
      slug: "satin-white-cover",
      title: "Satin White Cover",
      status: "draft",
      itemIds: [1, 2, 3, 4, 5],
      sizes: ["XS", "S", "M", "L", "XL"],
      now,
    }),
    pushedProduct({
      id: "00000000-0000-4000-8000-00000000d002",
      slug: "waterproof-inner-pillow-protector",
      title: "Waterproof Inner Pillow Protector",
      status: "active",
      itemIds: [11, 12, 13, 14, 15],
      sizes: ["XS", "S", "M", "L", "XL"],
      now,
    }),
  ];

  return {
    tables: {
      items: [
        // Just added in Inventory: no cost or MSRP yet.
        { id: 9101, name: "Silk Travel Pouch", size: null, category: "accessories", subtype: null, is_active: true },
      ],
      inventory_transactions: [
        { id: 910100, item_id: 9101, quantity_signed: 40, reason: "receive", created_at: now.toISOString() },
      ],
      item_prices: [...priced].map((itemId) => ({
        item_id: itemId,
        cost_price: costs[itemId] ?? null,
        msrp: MSRP_BY_ITEM[itemId] ?? null,
        currency: "SGD",
      })),
      categories: [
        {
          id: CATEGORY_ACCESSORIES,
          slug: "accessories",
          content: { "en-US": { name: "Accessories" } },
          position: 0,
        },
      ],
      products: pushed.map((p) => p.product),
      product_options: pushed.flatMap((p) => p.options),
      product_variants: pushed.flatMap((p) => p.variants),
    },
  };
}
