import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildArticleJsonLd, buildAuthorJsonLd } from "@/lib/seo/jsonld-article";

describe("article JSON-LD", () => {
  beforeEach(() => vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://custom.mpillow.com"));
  afterEach(() => vi.unstubAllEnvs());

  it("never presents the brand as a Person", () => {
    expect(buildAuthorJsonLd("Mpillow")).toEqual({ "@type": "Organization", name: "Mpillow", url: "https://custom.mpillow.com" });
    expect(buildAuthorJsonLd("TheMpillow SG")["@type"]).toBe("Organization");
    expect(buildAuthorJsonLd("")["@type"]).toBe("Organization");
  });

  it("keeps named people as Person, linked to the organisation", () => {
    expect(buildAuthorJsonLd("Jun Tan")).toEqual({
      "@type": "Person",
      name: "Jun Tan",
      worksFor: { "@type": "Organization", name: "Mpillow", url: "https://custom.mpillow.com" },
    });
  });

  it("uses the editorial update time for dateModified, falling back to publish date", () => {
    const base = { lang: "en-US", slug: "x", title: "T", description: "D", author: "Jun Tan", publishedAt: "2025-09-12T12:00:00Z" };
    expect(buildArticleJsonLd(base).dateModified).toBe("2025-09-12T12:00:00Z");
    expect(buildArticleJsonLd({ ...base, contentUpdatedAt: "2026-10-01T00:00:00Z" }).dateModified).toBe("2026-10-01T00:00:00Z");
  });
});
