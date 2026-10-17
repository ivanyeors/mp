import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { buildOrganizationJsonLd, organizationId } from "@/lib/seo/jsonld-organization";
import { buildArticleJsonLd } from "@/lib/seo/jsonld-article";

describe("page metadata", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://custom.mpillow.com"));
  afterEach(() => vi.unstubAllEnvs());

  const base = { title: "T", description: "D", path: "/blog/x" };

  it("lists every locale plus x-default on the default locale", () => {
    expect(buildPageMetadata({ ...base, lang: "zh-CN" }).alternates?.languages).toEqual({
      "en-US": "https://custom.mpillow.com/en-US/blog/x",
      "zh-CN": "https://custom.mpillow.com/zh-CN/blog/x",
      "x-default": "https://custom.mpillow.com/en-US/blog/x",
    });
  });

  it("lists only the locales a page really has", () => {
    const meta = buildPageMetadata({ ...base, lang: "en-US", alternateLocales: ["en-US"] });
    expect(meta.alternates?.canonical).toBe("https://custom.mpillow.com/en-US/blog/x");
    expect(meta.alternates?.languages).toEqual({
      "en-US": "https://custom.mpillow.com/en-US/blog/x",
      "x-default": "https://custom.mpillow.com/en-US/blog/x",
    });
  });
});

describe("organization JSON-LD", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://custom.mpillow.com"));
  afterEach(() => vi.unstubAllEnvs());

  it("carries a stable id, the award and Mpillow's own profiles", () => {
    const org = buildOrganizationJsonLd();
    expect(org["@id"]).toBe("https://custom.mpillow.com/#organization");
    expect(org.award).toBe("Singapore Good Design 2022");
    expect(org.sameAs).toContain("https://www.instagram.com/thempillow/");
    expect(JSON.stringify(org.sameAs)).not.toContain("linkedin");
  });

  it("is the same entity as an article's publisher", () => {
    const article = buildArticleJsonLd({ lang: "en-US", slug: "x", title: "T", description: "D", author: "Mpillow" });
    expect((article.publisher as Record<string, unknown>)["@id"]).toBe(organizationId());
  });
});
