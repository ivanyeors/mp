import { describe, expect, it } from "vitest";
import { PRODUCT_SEO_TARGETS, countWords, displayWidth, fitOf, productPageTitle } from "../product-seo";

/**
 * A product's search listing, measured the same way in the editor's
 * counters, its search preview and ✨ Generate SEO's checks.
 */

describe("productPageTitle", () => {
  it("adds the brand to a title that doesn't name it, as the product page does", () => {
    expect(productPageTitle("Slope Mattress")).toBe("Slope Mattress | Mpillow Singapore");
    expect(productPageTitle("Mpillow Premium")).toBe("Mpillow Premium");
  });
});

describe("displayWidth", () => {
  it("is the length in English, and two for each Chinese character or full-width mark", () => {
    expect(displayWidth("Slope Mattress")).toBe(14);
    expect(displayWidth("斜坡床垫")).toBe(8);
    expect(displayWidth("斜坡床垫：Mpillow")).toBe(17);
  });

  it("makes a title's limit one number in every language", () => {
    expect(displayWidth(productPageTitle("Slope Mattress: Foam Pillow Wedge"))).toBeLessThanOrEqual(PRODUCT_SEO_TARGETS.title.max);
    expect(displayWidth(productPageTitle("斜坡床垫：放在枕头下方的泡沫斜坡垫，头肩稍稍抬高"))).toBeGreaterThan(PRODUCT_SEO_TARGETS.title.max);
  });
});

describe("countWords", () => {
  it("counts English in words and Chinese in characters, a Latin name as one", () => {
    expect(countWords("  A foam wedge — under your pillow. ", "words")).toBe(6);
    expect(countWords("Mpillow 斜坡床垫", "characters")).toBe(5);
    expect(countWords("", "words")).toBe(0);
  });
});

describe("fitOf", () => {
  it("says whether a length is empty, short, good or long", () => {
    const range = { min: 60, max: 120 };
    expect([0, 30, 60, 120, 121].map((n) => fitOf(n, range))).toEqual(["empty", "short", "good", "good", "long"]);
  });
});
