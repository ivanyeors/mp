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

  it("canonicalises a locale the page has no text in, and declares no hreflang there", () => {
    const meta = buildPageMetadata({ ...base, lang: "zh-CN", alternateLocales: ["en-US"] });
    expect(meta.alternates?.canonical).toBe("https://custom.mpillow.com/en-US/blog/x");
    expect(meta.openGraph?.url).toBe("https://custom.mpillow.com/en-US/blog/x");
    expect(meta.alternates?.languages).toBeUndefined();
  });

  it("canonicalises a copy of another page there, with no hreflang", () => {
    const meta = buildPageMetadata({ ...base, path: "/shop/mbolster", lang: "zh-CN", copyOf: "/mbolster-config" });
    expect(meta.alternates?.canonical).toBe("https://custom.mpillow.com/zh-CN/mbolster-config");
    expect(meta.openGraph?.url).toBe("https://custom.mpillow.com/zh-CN/mbolster-config");
    expect(meta.alternates?.languages).toBeUndefined();
  });

  it("keeps a noindex page's links followed", () => {
    expect(buildPageMetadata({ ...base, lang: "en-US", noindex: true }).robots).toEqual({ index: false, follow: true });
  });

  it("falls back to the logo share image when the page has none", () => {
    const meta = buildPageMetadata({ ...base, lang: "en-US" });
    expect(meta.openGraph?.images).toEqual([{ url: "/og-image.png", width: 1200, height: 630, alt: "T" }]);
    expect(meta.twitter?.images).toEqual(["/og-image.png"]);
  });

  it("keeps the page's own share image", () => {
    const meta = buildPageMetadata({ ...base, lang: "en-US", image: "https://cdn.example/p.jpg" });
    expect(meta.openGraph?.images).toEqual([{ url: "https://cdn.example/p.jpg", width: 1200, height: 630, alt: "T" }]);
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
