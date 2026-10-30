// Sample MSRPs for Settings → Products → In the shop, which lists the covers,
// cases, protectors and accessories of the catalog in `analytics.mjs` (item ids
// below are that catalog's). Every price is made up. The "Colored" bolster
// case (25) is left unpriced on purpose, to show the switch a family gets
// before Costings gives it an MSRP.

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

export default function shop() {
  return {
    tables: {
      item_prices: Object.entries(MSRP_BY_ITEM).map(([item_id, msrp]) => ({
        item_id: Number(item_id),
        cost_price: null,
        msrp,
        currency: "SGD",
      })),
    },
  };
}
