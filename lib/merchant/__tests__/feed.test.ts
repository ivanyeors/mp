import { describe, expect, it } from "vitest";
import { buildFeedItems, plainText, toTsv, type FeedProduct, type FeedVariant } from "@/lib/merchant/feed";

const variant = (o: Partial<FeedVariant> = {}): FeedVariant => ({
  id: "v1",
  sku: "MP-PIL-M-BASIC",
  title: "Medium / Basic",
  option1: "Medium",
  price: 189,
  compare_at_price: null,
  currency: "sgd",
  track_inventory: true,
  image_url: null,
  is_active: true,
  position: 1,
  stock_available: 4,
  ...o,
});

const product = (o: Partial<FeedProduct> = {}): FeedProduct => ({
  id: "p1",
  slug: "mpillow-custom-pillow",
  product_type: "pillow",
  status: "active",
  title: "Mpillow Custom Pillow",
  description: "<p>A **customisable** cervical pillow,\ttuned to your neck.</p>",
  categoryName: null,
  images: [
    { url: "https://cdn/x/1.jpg", variant_id: null, position: 1 },
    { url: "https://cdn/x/2.jpg", variant_id: "v2", position: 2 },
  ],
  variants: [variant(), variant({ id: "v2", sku: null, title: "Large / Premium", option1: "Large", price: 249, compare_at_price: 279, position: 2, stock_available: 0 })],
  ...o,
});

const productUrl = (slug: string) => `https://custom.mpillow.com/en-US/shop/${slug}`;

describe("buildFeedItems", () => {
  it("lists one item per active variant, grouped, linking to the preselected variant", () => {
    const { items, skipped } = buildFeedItems([product()], { productUrl });
    expect(skipped).toEqual([]);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: "MP-PIL-M-BASIC",
      item_group_id: "p1",
      title: "Mpillow Custom Pillow – Medium / Basic",
      description: "A customisable cervical pillow, tuned to your neck.",
      link: "https://custom.mpillow.com/en-US/shop/mpillow-custom-pillow?variant=v1",
      image_link: "https://cdn/x/1.jpg",
      availability: "in_stock",
      price: "189.00 SGD",
      sale_price: "",
      product_type: "Custom pillows",
      size: "Medium",
      identifier_exists: "no",
    });
  });

  it("uses the variant image, the variant id when there is no SKU, and Google's sale convention", () => {
    const [, large] = buildFeedItems([product()], { productUrl }).items;
    expect(large).toMatchObject({
      id: "v2",
      image_link: "https://cdn/x/2.jpg",
      availability: "out_of_stock",
      price: "279.00 SGD",
      sale_price: "249.00 SGD",
    });
  });

  it("treats untracked inventory as in stock", () => {
    const { items } = buildFeedItems([product({ variants: [variant({ track_inventory: false, stock_available: 0 })] })], { productUrl });
    expect(items[0].availability).toBe("in_stock");
  });

  it("skips inactive variants and products, and reports variants without a price or image", () => {
    const { items, skipped } = buildFeedItems(
      [
        product({ status: "draft" }),
        product({ id: "p2", slug: "no-price", variants: [variant({ price: 0 }), variant({ id: "v9", is_active: false })] }),
        product({ id: "p3", slug: "no-image", images: [], variants: [variant()] }),
      ],
      { productUrl },
    );
    expect(items).toEqual([]);
    expect(skipped).toEqual([
      { productSlug: "no-price", variantId: "v1", reason: "no price" },
      { productSlug: "no-image", variantId: "v1", reason: "no image" },
    ]);
  });

  it("does not suffix the title for a single default variant", () => {
    const { items } = buildFeedItems(
      [product({ product_type: "accessory", variants: [variant({ title: "Default Title", option1: null })] })],
      { productUrl },
    );
    expect(items[0]).toMatchObject({ title: "Mpillow Custom Pillow", size: "", product_type: "Pillow accessories" });
  });
});

describe("toTsv / plainText", () => {
  it("writes a header row and never lets a tab or newline break a row", () => {
    const tsv = toTsv(buildFeedItems([product({ title: "Tab\there\nnewline" })], { productUrl }).items);
    const lines = tsv.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.split("\t").length === 15)).toBe(true);
  });

  it("truncates at a word boundary", () => {
    expect(plainText("one two three four", 10)).toBe("one two…");
  });
});
