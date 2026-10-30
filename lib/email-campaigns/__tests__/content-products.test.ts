import { describe, expect, it } from "vitest";
import {
  BLOCK_BUTTON_TARGET_LABEL,
  CampaignContentPreviewSchema,
  CampaignContentSchema,
  contentWords,
  emptyBlock,
  imageAssetsIn,
  PRODUCT_BUTTON_LABEL,
  productsIn,
  type CampaignContent,
} from "../content";

/**
 * The products block (PRD-campaign-email-editor slice 07): one to three
 * Storefront products by id, a layout and a button label. No name, photo or
 * price is ever the campaign's: the sender reads them from the shop at render.
 * And a button anywhere can go to one product's shop page.
 */

const COVER = "3b7e1f2a-9c4d-4a6b-8e1f-5d2c3b4a6e7f";
const NECK = "7c2a4e6b-1d3f-4b8a-9e2c-6f4d5a3b2c1e";
const CASE = "9e4b6d8a-2f1c-4e3a-8b7d-1c2e3f4a5b6d";
const PILLOW = "1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

const one = (...blocks: unknown[]) => ({ v: 1, blocks, fallbacks: {} });
const issues = (c: unknown) => CampaignContentSchema.safeParse(c).error?.issues.map((i) => [i.path.join("."), i.message]) ?? [];
const products = (over: Record<string, unknown> = {}) => ({
  id: "p",
  type: "products",
  products: [COVER, NECK],
  layout: "side_by_side",
  buttonLabel: "Shop now",
  ...over,
});

describe("a products block", () => {
  it("takes one to three product ids, a layout and a label, and nothing of the shop's", () => {
    expect(CampaignContentSchema.parse(one(products()))).toEqual(one(products()));
    expect(CampaignContentSchema.parse(one(products({ products: [COVER], layout: "rows" })))).toEqual(one(products({ products: [COVER], layout: "rows" })));
    expect(CampaignContentSchema.safeParse(one(products({ products: [COVER, NECK, CASE] }))).success).toBe(true);
    // A price, a name or a photo copied in is refused: the shop's are read at send.
    for (const extra of [{ price: 39 }, { title: "FibreCool Cover" }, { image: { asset: COVER, alt: "x" } }]) {
      expect(CampaignContentSchema.safeParse(one(products(extra))).success, JSON.stringify(extra)).toBe(false);
      expect(CampaignContentPreviewSchema.safeParse(one(products(extra))).success, JSON.stringify(extra)).toBe(false);
    }
  });

  it("refuses a fourth product, the same product twice, an id that is not one, and an unknown layout", () => {
    expect(issues(one(products({ products: [COVER, NECK, CASE, PILLOW] })))).toEqual([["blocks.0.products", "At most 3 products in one block."]]);
    expect(issues(one(products({ products: [COVER, COVER] })))).toEqual([["blocks.0.products.1", "That product is in this block already."]]);
    expect(issues(one(products({ products: ["FibreCool"] })))).toEqual([["blocks.0.products.0", "Choose a product."]]);
    expect(issues(one(products({ products: [COVER.toUpperCase()] })))).toEqual([["blocks.0.products.0", "Choose a product."]]);
    expect(CampaignContentSchema.safeParse(one(products({ layout: "carousel" }))).success).toBe(false);
  });

  it("starts empty, side by side, with the shop's own Shop now, and asks for a product on Save", () => {
    expect(emptyBlock("products", "p")).toEqual({ id: "p", type: "products", products: [], layout: "side_by_side", buttonLabel: PRODUCT_BUTTON_LABEL });
    expect(PRODUCT_BUTTON_LABEL).toBe("Shop now");
    expect(issues(one(emptyBlock("products", "p")))).toEqual([["blocks.0.products", "Choose a product."]]);
    expect(issues(one(products({ buttonLabel: " " })))).toEqual([["blocks.0.buttonLabel", "Give the button a label."]]);
    expect(issues(one(products({ buttonLabel: "Shop {first_name}" })))[0][0]).toBe("blocks.0.buttonLabel");
    // The preview draws it as it is, on its placeholder.
    expect(CampaignContentPreviewSchema.safeParse(one(emptyBlock("products", "p"))).success).toBe(true);
  });

  it("names only its own label among the words, and places no image of the campaign's", () => {
    const c = one(products({ buttonLabel: "See it" })) as CampaignContent;
    expect(contentWords(c)).toEqual(["See it"]);
    expect(imageAssetsIn(c)).toEqual([]);
  });
});

describe("a product button", () => {
  const button = (over: Record<string, unknown>) => one({ id: "b", type: "buttons", buttons: [{ label: "Shop the cover", style: "primary", ...over }] });

  it("goes to one product, which it names by id", () => {
    expect(BLOCK_BUTTON_TARGET_LABEL.product).toBe("A product");
    expect(CampaignContentSchema.safeParse(button({ target: "product", product: COVER })).success).toBe(true);
    expect(issues(button({ target: "product" }))).toEqual([["blocks.0.buttons.0.product", "Choose a product."]]);
    expect(issues(button({ target: "product", product: "" }))).toEqual([["blocks.0.buttons.0.product", "Choose a product."]]);
    // The preview takes it before a product is chosen.
    expect(CampaignContentPreviewSchema.safeParse(button({ target: "product", product: "" })).success).toBe(true);
  });

  it("keeps a product only on a product button, and a link only on a link button", () => {
    expect(issues(button({ target: "shop", product: COVER }))).toEqual([["blocks.0.buttons.0.product", "Only a product button has a product of its own."]]);
    expect(issues(button({ target: "product", product: COVER, url: "https://custom.mpillow.com/x" }))).toEqual([
      ["blocks.0.buttons.0.url", "Only a link button has a link of its own."],
    ]);
  });
});

describe("productsIn", () => {
  it("lists every product the email shows or links to, once each, in order", () => {
    const c = one(
      products({ products: [COVER, NECK] }),
      { id: "b", type: "buttons", buttons: [{ label: "Shop", target: "product", product: CASE, style: "primary" }] },
      {
        id: "h",
        type: "hero",
        image: { asset: "6f1c2b9e-3d4a-4e8b-9c1d-2a3b4c5d6e7f", alt: "A cover" },
        button: { label: "See it", target: "product", product: NECK, style: "primary" },
      },
      { id: "s", type: "buttons", buttons: [{ label: "Pick one", target: "product", product: "", style: "primary" }] },
    ) as CampaignContent;
    expect(productsIn(c)).toEqual([COVER, NECK, CASE]);
    expect(productsIn(one() as CampaignContent)).toEqual([]);
  });
});
