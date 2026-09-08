import { describe, expect, it } from "vitest";

import { DEFAULT_SECTIONS_COUNT, selectRenderableSections } from "@/lib/landing-sections";
import {
  CreatableSectionTypeSchema,
  SectionContentSchema,
  SlugSchema,
  isAllowedImageUrl,
  isCustomSectionType,
  isSingletonSectionType,
} from "@/lib/page-builder/validation";
import type { LandingSection } from "@/lib/types/landing-sections";

function section(over: Partial<LandingSection> = {}): LandingSection {
  return {
    id: "id",
    section_type: "text_image",
    slug: "slug",
    position: 0,
    visible: true,
    content: {},
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("creatable section types", () => {
  it("accepts custom types", () => {
    expect(CreatableSectionTypeSchema.safeParse("custom_rich_text").success).toBe(true);
    expect(CreatableSectionTypeSchema.safeParse("shop_cta").success).toBe(true);
  });

  it("rejects built-in types, which are seeded rather than created", () => {
    expect(CreatableSectionTypeSchema.safeParse("hero").success).toBe(false);
    expect(CreatableSectionTypeSchema.safeParse("text_image").success).toBe(false);
  });

  it("rejects unknown types", () => {
    expect(CreatableSectionTypeSchema.safeParse("custom_rich_txt").success).toBe(false);
    expect(CreatableSectionTypeSchema.safeParse("").success).toBe(false);
  });
});

describe("custom vs built-in", () => {
  it("drives slug locking and deletion", () => {
    expect(isCustomSectionType("custom_video")).toBe(true);
    expect(isCustomSectionType("hero")).toBe(false);
    // Generic-looking, but seeded twice and branched on by slug.
    expect(isCustomSectionType("text_image")).toBe(false);
  });
});

describe("singleton section types", () => {
  it("treats faq as a singleton so FAQPage JSON-LD is not duplicated", () => {
    expect(isSingletonSectionType("faq")).toBe(true);
  });

  it("allows repeatable types", () => {
    expect(isSingletonSectionType("text_image")).toBe(false);
    expect(isSingletonSectionType("custom_text_image")).toBe(false);
  });
});

describe("slug", () => {
  it("accepts kebab-case", () => {
    expect(SlugSchema.safeParse("my-new-section").success).toBe(true);
  });

  it("rejects spaces, capitals and edge dashes", () => {
    expect(SlugSchema.safeParse("My Section").success).toBe(false);
    expect(SlugSchema.safeParse("-leading").success).toBe(false);
    expect(SlugSchema.safeParse("trailing-").success).toBe(false);
    expect(SlugSchema.safeParse("").success).toBe(false);
  });
});

describe("image URLs", () => {
  it("allows a cleared field, so the site_settings slot takes over", () => {
    expect(isAllowedImageUrl("")).toBe(true);
    expect(isAllowedImageUrl("   ")).toBe(true);
  });

  it("allows repo-relative paths", () => {
    expect(isAllowedImageUrl("/images/hero.webp")).toBe(true);
  });

  it("allows the configured storage host over https", () => {
    expect(
      isAllowedImageUrl("https://irgxjthamhiaolvdfgar.supabase.co/storage/v1/object/public/media/a.webp"),
    ).toBe(true);
  });

  it("rejects hosts next/image cannot optimise, which would 500 the homepage", () => {
    expect(isAllowedImageUrl("https://evil.example.com/a.png")).toBe(false);
    expect(isAllowedImageUrl("//evil.example.com/a.png")).toBe(false);
    expect(isAllowedImageUrl("not a url")).toBe(false);
  });

  it("rejects plain http even on the allowed host", () => {
    expect(isAllowedImageUrl("http://irgxjthamhiaolvdfgar.supabase.co/a.png")).toBe(false);
  });
});

describe("section content", () => {
  it("passes content with no image", () => {
    expect(SectionContentSchema.safeParse({ title: "hello" }).success).toBe(true);
  });

  it("rejects a bad image host with an actionable message", () => {
    const result = SectionContentSchema.safeParse({ image: "https://evil.example.com/a.png" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["image"]);
      expect(result.error.issues[0].message).toMatch(/media library/);
    }
  });

  it("rejects a non-string image", () => {
    expect(SectionContentSchema.safeParse({ image: 42 }).success).toBe(false);
  });
});

describe("selectRenderableSections", () => {
  it("falls back to the seed layout only when the table is empty", () => {
    expect(selectRenderableSections([])).toHaveLength(DEFAULT_SECTIONS_COUNT);
  });

  it("renders nothing when every section is hidden", () => {
    const rows = [section({ id: "a", visible: false }), section({ id: "b", visible: false })];
    expect(selectRenderableSections(rows)).toEqual([]);
  });

  it("renders only the visible sections", () => {
    const rows = [
      section({ id: "a", slug: "a", visible: true }),
      section({ id: "b", slug: "b", visible: false }),
      section({ id: "c", slug: "c", visible: true }),
    ];
    expect(selectRenderableSections(rows).map((s) => s.slug)).toEqual(["a", "c"]);
  });
});
