import { describe, expect, it } from "vitest";

import { enUS } from "@/lib/i18n/messages/en-US";
import { buildFeatureCarouselItems } from "@/lib/product-slide-sections/feature-carousel-items";
import { resolveSlideContent } from "@/lib/product-slide-sections/resolve-slide-content";
import {
  IMPLEMENTED_SECTION_TYPES,
  isImplementedSectionType,
  isProductSlideSectionType,
} from "@/lib/product-slide-sections/section-config";
import { PRODUCT_SLIDE_SECTION_TYPES } from "@/lib/product-slide-sections/types";
import { basicMpillowSlideSections } from "@/lib/product-slide-sections/configs/basic-mpillow";

const basicMessages = enUS.slides.basicMpillow;

describe("resolveSlideContent", () => {
  it("resolves split_hero hero contentKey from basicMpillow i18n", () => {
    const content = resolveSlideContent(basicMessages, "split_hero", "hero");

    expect(content.title).toBe(basicMessages.heroTitle);
    expect(content.paragraphs).toEqual(basicMessages.heroParagraphs);
    expect(content.listTitle).toBe(basicMessages.packagingTitle);
    expect(content.listItems).toEqual(basicMessages.packagingItems);
  });

  it("resolves sizeGuide contentKey with embedded table", () => {
    const content = resolveSlideContent(basicMessages, "split_hero", "sizeGuide");

    expect(content.title).toBe(basicMessages.sizeTitle);
    expect(content.table?.rows).toHaveLength(basicMessages.sizeTable.rows.length);
  });

  it("resolves firmness_compare content", () => {
    const content = resolveSlideContent(basicMessages, "firmness_compare", "firmness");
    expect(content.title).toBe(basicMessages.firmnessTitle);
    expect(content.description).toBe(basicMessages.firmnessDescription);
  });

  it("resolves feature_carousel features", () => {
    const content = resolveSlideContent(basicMessages, "feature_carousel", "features");
    expect(content.features).toHaveLength(4);
  });

  it("throws for unknown contentKey", () => {
    expect(() => resolveSlideContent(basicMessages, "split_hero", "missing")).toThrow(
      /no split_hero extractor/,
    );
  });
});

describe("premiumMpillow resolvers", () => {
  const premiumMessages = enUS.slides.premiumMpillow;

  it("resolves trust_strip", () => {
    const content = resolveSlideContent(premiumMessages, "trust_strip", "trust");
    expect(content.items).toHaveLength(4);
  });
});

describe("buildFeatureCarouselItems", () => {
  it("pairs features with images", () => {
    const features = resolveSlideContent(basicMessages, "feature_carousel", "features").features;
    const images = basicMpillowSlideSections.find((s) => s.type === "feature_carousel")!.images;
    const items = buildFeatureCarouselItems(features, images);

    expect(items).toHaveLength(4);
    // Slice 17: hosted when resolved map populated, else /public fallback
    expect(
      items[0]?.image.src === "/basic-mpillow.webp" ||
        /^https?:\/\//i.test(items[0]?.image.src ?? ""),
    ).toBe(true);
  });
});

describe("section dispatch", () => {
  it("recognises all v1 template IDs", () => {
    for (const type of PRODUCT_SLIDE_SECTION_TYPES) {
      expect(isProductSlideSectionType(type)).toBe(true);
    }
  });

  it("implements all Basic Mpillow recipe section types", () => {
    const recipeTypes = basicMpillowSlideSections.map((s) => s.type);
    for (const type of recipeTypes) {
      expect(isImplementedSectionType(type)).toBe(true);
    }
    expect(IMPLEMENTED_SECTION_TYPES).toContain("split_hero");
    expect(IMPLEMENTED_SECTION_TYPES).toContain("purchase_panel");
    expect(IMPLEMENTED_SECTION_TYPES.length).toBeGreaterThanOrEqual(20);
  });
});
