import { describe, it, expect } from "vitest";
import { z } from "zod";
import { resolveUsages } from "@/lib/media/image-usages";

const BlogImageSchema = z.object({
  image_url: z.string().nullable().optional().default(null),
  media_asset_id: z.string().uuid().nullable().optional().default(null),
});

const CategoryImageSchema = z.object({
  image_url: z.string().url().nullable().optional().default(null),
  media_asset_id: z.string().uuid().nullable().optional().default(null),
});

const PartnerLogoSchema = z.object({
  logo_url: z.string().nullable().optional(),
  media_asset_id: z.string().uuid().nullable().optional().default(null),
});

const PartnersHeroSchema = z.object({
  heroImage: z.string().optional(),
  media_asset_id: z.string().uuid().nullable().optional(),
});

const LandingImageContentSchema = z.object({
  image: z.string().optional(),
  media_asset_id: z.string().uuid().nullable().optional(),
});

const ASSET_ID = "11111111-1111-4111-8111-111111111111";

describe("asset picker rollout (slice 12)", () => {
  it("blog hybrid body accepts media_asset_id", () => {
    const parsed = BlogImageSchema.safeParse({
      image_url: "https://cdn.example/blog.webp",
      media_asset_id: ASSET_ID,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.media_asset_id).toBe(ASSET_ID);
  });

  it("category / partner / partners hero / landing accept hybrid + legacy url-only", () => {
    expect(
      CategoryImageSchema.safeParse({
        image_url: "https://cdn.example/cat.webp",
        media_asset_id: ASSET_ID,
      }).success,
    ).toBe(true);
    expect(CategoryImageSchema.safeParse({ image_url: "https://cdn.example/cat.webp" }).success).toBe(
      true,
    );

    expect(
      PartnerLogoSchema.safeParse({
        logo_url: "https://cdn.example/logo.webp",
        media_asset_id: ASSET_ID,
      }).success,
    ).toBe(true);
    expect(PartnerLogoSchema.safeParse({ logo_url: "https://cdn.example/logo.webp" }).success).toBe(
      true,
    );

    expect(
      PartnersHeroSchema.safeParse({
        heroImage: "https://cdn.example/hero.webp",
        media_asset_id: ASSET_ID,
      }).success,
    ).toBe(true);
    expect(PartnersHeroSchema.safeParse({ heroImage: "https://cdn.example/hero.webp" }).success).toBe(
      true,
    );

    expect(
      LandingImageContentSchema.safeParse({
        image: "https://cdn.example/section.webp",
        media_asset_id: ASSET_ID,
      }).success,
    ).toBe(true);
    expect(
      LandingImageContentSchema.safeParse({ image: "https://cdn.example/section.webp" }).success,
    ).toBe(true);
  });

  it("rejects invalid media_asset_id on blog body", () => {
    expect(
      BlogImageSchema.safeParse({
        image_url: "https://cdn.example/a.webp",
        media_asset_id: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("legacy url-only rows still count as used across surfaces", () => {
    const hosted = "https://cdn.example/legacy.webp";
    const usages = resolveUsages(
      { id: "asset-legacy", hosted_url: hosted },
      {
        blogs: [{ id: "b1", slug: "post", image_url: hosted, content: {}, media_asset_id: null }],
        categories: [{ id: "c1", slug: "cat", image_url: hosted, media_asset_id: null }],
        partners: [{ id: "p1", name: "Acme", logo_url: hosted, media_asset_id: null }],
        partnersPages: [{ id: "pp1", content: { "en-US": { heroImage: hosted } } }],
        landingSections: [{ id: "ls1", slug: "hero", content: { image: hosted } }],
      },
    );
    expect(usages.map((u) => u.type).sort()).toEqual([
      "blog_featured",
      "category",
      "landing_section",
      "partner",
      "partners_page",
    ]);
  });

  it("id match works when display url differs (column + JSONB)", () => {
    const usages = resolveUsages(
      { id: ASSET_ID, hosted_url: "https://cdn.example/original.webp" },
      {
        blogs: [
          {
            id: "b2",
            slug: "post",
            image_url: "https://cdn.example/display.webp",
            content: {},
            media_asset_id: ASSET_ID,
          },
        ],
        categories: [
          {
            id: "c2",
            slug: "cat",
            image_url: "https://cdn.example/display.webp",
            media_asset_id: ASSET_ID,
          },
        ],
        partners: [
          {
            id: "p2",
            name: "Acme",
            logo_url: "https://cdn.example/display.webp",
            media_asset_id: ASSET_ID,
          },
        ],
        partnersPages: [
          {
            id: "pp2",
            content: {
              "en-US": { heroImage: "https://cdn.example/display.webp", media_asset_id: ASSET_ID },
            },
          },
        ],
        landingSections: [
          {
            id: "ls2",
            slug: "hero",
            content: { image: "https://cdn.example/display.webp", media_asset_id: ASSET_ID },
          },
        ],
      },
    );
    expect(usages.map((u) => u.type).sort()).toEqual([
      "blog_featured",
      "category",
      "landing_section",
      "partner",
      "partners_page",
    ]);
  });
});
