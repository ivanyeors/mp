import { describe, expect, it } from "vitest";

import { SUPPORTED_LOCALES } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";
import { enUS } from "@/lib/i18n/messages/en-US";
import {
  applyCopyOverride,
  applyMediaOverride,
  HEADER_SLUG,
  headerDefaults,
  mediaReferences,
  resolveSectionDefaults,
} from "@/lib/slide-in-pages/content";
import { mediaFieldsFor, visibleCopyFields } from "@/lib/slide-in-pages/fields";
import { SLIDE_IN_PAGE_KEYS, SLIDE_IN_PAGES, slideMessages } from "@/lib/slide-in-pages/pages";
import {
  orderedSlideSections,
  slideInSectionViews,
  summariseSlideInPending,
  type SlideInSectionRow,
} from "@/lib/slide-in-pages/sections";
import { SlideInContentSchema, strings, validateSlideInCopy } from "@/lib/slide-in-pages/validation";

function row(partial: Partial<SlideInSectionRow> & Pick<SlideInSectionRow, "slug">): SlideInSectionRow {
  return {
    id: `row-${partial.slug}`,
    page: "basic-mpillow",
    section_type: "split_hero",
    position: 0,
    visible: true,
    content: {},
    ...partial,
  };
}

describe("sub page registry", () => {
  it.each(SLIDE_IN_PAGE_KEYS)("%s has unique section keys and none called header", (page) => {
    const keys = SLIDE_IN_PAGES[page].sections.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).not.toContain(HEADER_SLUG);
    for (const key of keys) expect(key).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it.each(SLIDE_IN_PAGE_KEYS)("%s resolves every section and its header in both languages", (page) => {
    for (const locale of SUPPORTED_LOCALES) {
      const messages = slideMessages(getMessages(locale), page);
      expect(headerDefaults(messages).title).toEqual(expect.any(String));
      for (const section of SLIDE_IN_PAGES[page].sections) {
        expect(() => resolveSectionDefaults(messages, section)).not.toThrow();
      }
    }
  });
});

describe("content kept when Size Matters and Ambassadors moved onto templates", () => {
  const rendered = (page: "size-matters" | "ambassadors", locale: (typeof SUPPORTED_LOCALES)[number]) => {
    const messages = slideMessages(getMessages(locale), page);
    const out = new Set<string>(strings(headerDefaults(messages)).map(([, s]) => s));
    for (const section of SLIDE_IN_PAGES[page].sections) {
      for (const [, s] of strings(resolveSectionDefaults(messages, section))) out.add(s);
    }
    return out;
  };

  it.each(SUPPORTED_LOCALES)("Size Matters (%s)", (locale) => {
    const { trigger: _trigger, measurementCards, ...rest } = getMessages(locale).slides.sizeMatters;
    void _trigger;
    const shown = rendered("size-matters", locale);
    for (const [, s] of strings(rest)) expect(shown).toContain(s);
    for (const card of measurementCards) {
      expect(shown).toContain(card.title);
      expect(shown).toContain(card.description);
    }
  });

  it.each(SUPPORTED_LOCALES)("Ambassadors (%s)", (locale) => {
    const { trigger: _trigger, ...rest } = getMessages(locale).slides.ambassadors;
    void _trigger;
    const shown = rendered("ambassadors", locale);
    for (const [, s] of strings(rest)) expect(shown).toContain(s);
  });

  it("keeps every image and the video", () => {
    const media = (page: "size-matters" | "ambassadors") =>
      SLIDE_IN_PAGES[page].sections.flatMap((section) => [
        ...mediaFieldsFor(section).flatMap((f) =>
          f.kind === "image" ? [f.fallback.src] : f.kind === "images" ? f.fallbacks.map((i) => i?.src) : [f.fallback],
        ),
        ...("icons" in section ? section.icons : []),
      ]);
    expect(media("size-matters")).toEqual(
      expect.arrayContaining([
        "/sizecomparison.webp",
        "/shoulder-length.svg",
        "/neck-length.svg",
        "/neck-to-back.svg",
        "/head-to-back.svg",
        "/Head-Shapes-GIF.gif",
        "/five-sizes.webp",
        "/stitch-inner-component.webp",
        "/diff-body-back-sleep.webp",
      ]),
    );
    const ambassadors = media("ambassadors").join(" ");
    expect(ambassadors).toContain("ambassadors-1");
    expect(ambassadors).toContain("ambassadors-2");
    expect(ambassadors).toContain("ambassadors-3");
    expect(media("ambassadors")).toContain("z2u69YPvHi4");
  });
});

describe("slideInSectionViews", () => {
  const keys = SLIDE_IN_PAGES["basic-mpillow"].sections.map((s) => s.key);

  it("with no rows is the code config, header first, everything shown", () => {
    const views = slideInSectionViews("basic-mpillow", [], "published");
    expect(views.map((v) => v.slug)).toEqual([HEADER_SLUG, ...keys]);
    expect(views.every((v) => v.visible)).toBe(true);
    expect(views.every((v) => v.pending.length === 0)).toBe(true);
  });

  it("orders by stored position and falls back to config order on ties", () => {
    const rows = [
      row({ slug: "sizing-video", section_type: "video_section", position: 0 }),
      row({ slug: "hero", position: 3 }),
    ];
    const views = slideInSectionViews("basic-mpillow", rows, "published");
    expect(views.map((v) => v.slug)).toEqual([
      HEADER_SLUG,
      "sizing-video",
      "firmness",
      "features",
      "hero",
      "size-guide",
    ]);
  });

  it("applies drafts only in draft mode, and reports what is pending", () => {
    const rows = [
      row({
        slug: "hero",
        content: { copy: { "en-US": { title: "Live" } } },
        draft_content: { copy: { "en-US": { title: "Draft" } } },
        draft_visible: false,
      }),
    ];
    const live = slideInSectionViews("basic-mpillow", rows, "published").find((v) => v.slug === "hero")!;
    const draft = slideInSectionViews("basic-mpillow", rows, "draft").find((v) => v.slug === "hero")!;
    expect(live.content.copy?.["en-US"]?.title).toBe("Live");
    expect(live.visible).toBe(true);
    expect(draft.content.copy?.["en-US"]?.title).toBe("Draft");
    expect(draft.visible).toBe(false);
    expect(draft.pending).toEqual(["content", "visibility"]);
  });

  it("ignores rows for other pages and keys the code no longer has", () => {
    const rows = [
      row({ slug: "gone", position: 0, visible: false }),
      row({ slug: "hero", page: "mbolster", visible: false }),
    ];
    const views = slideInSectionViews("basic-mpillow", rows, "published");
    expect(views.map((v) => v.slug)).toEqual([HEADER_SLUG, ...keys]);
    expect(views.every((v) => v.visible)).toBe(true);
    expect(orderedSlideSections("basic-mpillow", views).map((s) => s.config.key)).toEqual(keys);
  });

  it("never hides the header", () => {
    const views = slideInSectionViews(
      "basic-mpillow",
      [row({ slug: HEADER_SLUG, section_type: "header", visible: false })],
      "published",
    );
    expect(views[0]).toMatchObject({ slug: HEADER_SLUG, header: true, visible: true });
  });

  it("summarises pending drafts for one page", () => {
    const rows = [
      row({ slug: "hero", draft_content: {} }),
      row({ slug: "features", draft_position: 0, draft_visible: false }),
      row({ slug: "hero", page: "mbolster", draft_content: {} }),
    ];
    expect(summariseSlideInPending("basic-mpillow", rows)).toMatchObject({
      total: 2,
      content: 1,
      position: 1,
      visibility: 1,
      slugs: ["hero", "features"],
    });
  });
});

describe("applyCopyOverride", () => {
  const messages = enUS.slides.basicMpillow as unknown as Record<string, unknown>;
  const [hero, , features] = SLIDE_IN_PAGES["basic-mpillow"].sections;
  const heroDefaults = resolveSectionDefaults(messages, hero!);
  const featureDefaults = resolveSectionDefaults(messages, features!);

  it("replaces a text field and keeps the rest", () => {
    const out = applyCopyOverride("split_hero", heroDefaults, { title: "Sleep better" });
    expect(out.title).toBe("Sleep better");
    expect(out.paragraphs).toEqual(heroDefaults.paragraphs);
  });

  it("treats blank text and empty lists as no override", () => {
    const out = applyCopyOverride("split_hero", heroDefaults, { title: "  ", paragraphs: ["", " "] });
    expect(out.title).toBe(heroDefaults.title);
    expect(out.paragraphs).toEqual(heroDefaults.paragraphs);
  });

  it("drops blank items from a list", () => {
    const out = applyCopyOverride("split_hero", heroDefaults, { listItems: ["One", "", "Two"] });
    expect(out.listItems).toEqual(["One", "Two"]);
  });

  it("keeps a carousel's card count, filling blank fields from the default", () => {
    const out = applyCopyOverride("feature_carousel", featureDefaults, {
      features: [{ title: "New first", description: "" }, { title: "New second" }, {}, {}, { title: "Extra" }],
    });
    const cards = out.features as Array<{ title: string; description: string }>;
    const defaults = featureDefaults.features as Array<{ title: string; description: string }>;
    expect(cards).toHaveLength(defaults.length);
    expect(cards[0]).toEqual({ title: "New first", description: defaults[0]!.description });
    expect(cards[1]!.title).toBe("New second");
    expect(cards[2]).toEqual(defaults[2]);
  });

  it("lets resizable cards grow and shrink", () => {
    const defaults = { title: "T", cards: [{ title: "A", description: "a" }, { title: "B", description: "b" }] };
    const out = applyCopyOverride("commitment_cards", defaults, {
      cards: [{ title: "Only", description: "one" }],
    });
    expect(out.cards).toEqual([{ title: "Only", description: "one" }]);
  });

  it("ignores keys the template does not edit", () => {
    const out = applyCopyOverride("split_hero", heroDefaults, { table: "nope", price: "$1" });
    expect(out.table).toEqual(heroDefaults.table);
    expect(out).not.toHaveProperty("price");
  });

  it("only offers the fields a section's layout uses", () => {
    const keysOf = (fields: ReturnType<typeof visibleCopyFields>) => fields.map((f) => f.key);
    expect(keysOf(visibleCopyFields("split_hero", heroDefaults))).toEqual([
      "title",
      "paragraphs",
      "listTitle",
      "listItems",
    ]);
  });
});

describe("applyMediaOverride", () => {
  const [hero, , features, , video] = SLIDE_IN_PAGES["basic-mpillow"].sections;

  it("replaces an image and keeps the config's sizing", () => {
    const out = applyMediaOverride(hero!, { image: { src: "/new.webp", assetId: "a1" } });
    expect(out).toMatchObject({ image: { src: "/new.webp", assetId: "a1", alt: "Basic Mpillow" } });
    expect((out as typeof hero & { image: { sizes?: string } }).image.sizes).toBe(
      (hero as { image: { sizes?: string } }).image.sizes,
    );
  });

  it("falls back when the override has no src", () => {
    expect(applyMediaOverride(hero!, { image: { src: "" } })).toEqual(hero);
  });

  it("replaces images slot by slot and never adds slots", () => {
    const base = (features as { images: Array<{ src: string }> }).images;
    const out = applyMediaOverride(features!, {
      images: [null, { src: "/two.webp" }, null, null, { src: "/extra.webp" }],
    }) as { images: Array<{ src: string }> };
    expect(out.images).toHaveLength(base.length);
    expect(out.images[0]!.src).toBe(base[0]!.src);
    expect(out.images[1]!.src).toBe("/two.webp");
  });

  it("takes a video id but not a link", () => {
    expect(applyMediaOverride(video!, { videoId: "abcDEF12345" })).toMatchObject({ videoId: "abcDEF12345" });
    expect(applyMediaOverride(video!, { videoId: "https://youtu.be/x" })).toEqual(video);
  });

  it("lists every referenced image for the Media library", () => {
    expect(
      mediaReferences({
        media: { image: { src: "https://x/a.webp", assetId: "a" }, images: [null, { src: "/b.webp" }] },
      }),
    ).toEqual({ urls: ["https://x/a.webp", "/b.webp"], assetIds: ["a"] });
  });
});

describe("validation", () => {
  it("rejects images from hosts next/image will not load", () => {
    expect(SlideInContentSchema.safeParse({ media: { image: { src: "https://evil.example/x.png" } } }).success).toBe(
      false,
    );
    expect(SlideInContentSchema.safeParse({ media: { image: { src: "/ok.webp" } } }).success).toBe(true);
  });

  it("rejects a video link in place of an id", () => {
    expect(SlideInContentSchema.safeParse({ media: { videoId: "https://youtu.be/abc" } }).success).toBe(false);
    expect(SlideInContentSchema.safeParse({ media: { videoId: "r9XfezALQhA" } }).success).toBe(true);
  });

  it("rejects unknown top-level keys", () => {
    expect(SlideInContentSchema.safeParse({ title: "x" }).success).toBe(false);
  });

  it("flags clinical claims in either language, but not copy that is already the default", () => {
    const issues = validateSlideInCopy("split_hero", {
      copy: { "en-US": { title: "We cure neck pain" }, "zh-CN": { paragraphs: ["可以治愈"] } },
    });
    expect(issues.map((i) => i.locale)).toEqual(["en-US", "zh-CN"]);

    const known = { "en-US": new Set(["We cure neck pain"]) };
    expect(
      validateSlideInCopy("split_hero", { copy: { "en-US": { title: "We cure neck pain" } } }, known),
    ).toEqual([]);
  });
});
