import { describe, expect, it } from "vitest";
import { getGuideContent } from "@/lib/seo/guides-content";
import { MAX_META_DESCRIPTION_CHARS, MIN_META_DESCRIPTION_CHARS } from "@/lib/seo/meta-description";
import { ENGLISH_ONLY_PAGE_META, PAGE_META, productMetaDescription } from "@/lib/seo/page-meta";

const descriptions: [string, string][] = [
  ...Object.entries(PAGE_META).flatMap(([page, byLocale]) =>
    Object.entries(byLocale).map(([locale, meta]): [string, string] => [`${page} ${locale}`, meta.description]),
  ),
  ...Object.entries(ENGLISH_ONLY_PAGE_META).map(([page, meta]): [string, string] => [page, meta.description]),
  ...(["neck-pain", "cervical-pillow", "custom-pillow"] as const).flatMap((topic) =>
    (["en-US", "zh-CN"] as const).map((locale): [string, string] => [
      `guide ${topic} ${locale}`,
      getGuideContent(topic, locale)!.metaDescription,
    ]),
  ),
];

describe("page descriptions", () => {
  it.each(descriptions)("%s fills a search snippet without being cut", (_page, description) => {
    expect(description.length).toBeGreaterThanOrEqual(MIN_META_DESCRIPTION_CHARS);
    expect(description.length).toBeLessThanOrEqual(MAX_META_DESCRIPTION_CHARS);
  });
});

describe("product descriptions", () => {
  it("keeps Staff's SEO description as written", () => {
    expect(productMetaDescription({ title: "Pad", seo_description: "Short." }, "en-US")).toBe("Short.");
  });

  it("keeps a product description that already fills a snippet", () => {
    const description = "A".repeat(MIN_META_DESCRIPTION_CHARS);
    expect(productMetaDescription({ title: "Pad", description }, "en-US")).toBe(description);
  });

  it.each<[{ title: string; description?: string }]>([
    [{ title: "Slope Mattress" }],
    [{ title: "Mbolster", description: "Premium support bolster available in three lengths" }],
    [{ title: "X", description: "A long product description that still falls short of a snippet by a few words here." }],
  ])("tops up %j to a full snippet in English", (content) => {
    const text = productMetaDescription(content, "en-US");
    expect(text.startsWith(content.description ?? content.title)).toBe(true);
    expect(text.length).toBeGreaterThanOrEqual(MIN_META_DESCRIPTION_CHARS);
    expect(text.length).toBeLessThanOrEqual(MAX_META_DESCRIPTION_CHARS);
  });

  it("tops up in Chinese on a zh-CN page", () => {
    const text = productMetaDescription({ title: "定制抱枕", description: "三种长度可选的高级支撑抱枕" }, "zh-CN");
    expect(text).toMatch(/^三种长度可选的高级支撑抱枕。来自新加坡/);
    expect(text.length).toBeGreaterThanOrEqual(MIN_META_DESCRIPTION_CHARS);
    expect(text.length).toBeLessThanOrEqual(MAX_META_DESCRIPTION_CHARS);
  });
});
