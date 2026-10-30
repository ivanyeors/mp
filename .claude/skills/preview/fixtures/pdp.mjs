// One Storefront product with a slug, so a product page renders:
// `preview shoot /shop/ear-comfort-pad`. The accessories in `analytics.mjs`
// have no slug or content, so no product page opens on them. The name is the
// real catalog's; the copy, tags, price and stock are made up.

export default function pdp() {
  const at = "2026-01-05T02:00:00Z";
  return {
    tables: {
      products: [
        {
          id: "00000000-0000-4000-8000-0000000000e1",
          slug: "ear-comfort-pad",
          product_type: "accessory",
          status: "active",
          featured: false,
          category_id: null,
          tags: ["material:Memory foam", "care:Hand wash, dry flat", "dimensions:12 x 9 cm"],
          content: {
            "en-US": {
              title: "Ear Comfort Pad",
              description: "A soft pad that takes the pressure off your ear when you sleep on your side.",
              body: "A soft pad that takes the pressure off your ear when you sleep on your side.\n\nSlip it over the pillow where your ear rests; the cut-out leaves room for the ear so the side of your head carries the weight.",
            },
          },
          published_at: at,
          created_at: at,
          updated_at: at,
        },
      ],
      product_variants: [
        {
          id: "00000000-0000-4000-8000-0000000000e2",
          product_id: "00000000-0000-4000-8000-0000000000e1",
          sku: "EAR-PAD",
          title: "Ear Comfort Pad",
          option1: null,
          price: 60,
          currency: "SGD",
          track_inventory: true,
          weight_grams: 120,
          is_active: true,
          position: 0,
        },
      ],
    },
    views: {
      variant_stock: () => [{ variant_id: "00000000-0000-4000-8000-0000000000e2", stock_available: 12 }],
    },
  };
}
