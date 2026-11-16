import { describe, expect, it } from "vitest";

import { resolveContentLocale } from "@/lib/page-builder/locale";
import {
  CreatableSectionTypeSchema,
  isAllowedLinkUrl,
  isCustomSectionType,
  sectionContentErrors,
} from "@/lib/page-builder/validation";
import { tiktokVideosFromContent } from "@/lib/tiktok/videos";
import { CUSTOM_SECTION_TEMPLATES } from "@/lib/types/landing-sections";

const POST = "https://www.tiktok.com/@thempillow/video/7301234567890123456";
const COVER = "https://irgxjthamhiaolvdfgar.supabase.co/storage/v1/object/public/media/cover.jpg";

function video(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { tiktokUrl: POST, image: COVER, buttonUrl: "/shop", ...over };
}

describe("tiktok_videos section type", () => {
  it("can be added from the builder", () => {
    expect(CreatableSectionTypeSchema.safeParse("tiktok_videos").success).toBe(true);
    expect(isCustomSectionType("tiktok_videos")).toBe(true);
    expect(CUSTOM_SECTION_TEMPLATES.some((t) => t.type === "tiktok_videos")).toBe(true);
  });
});

describe("tiktok_videos content rules", () => {
  const errors = (content: Record<string, unknown>) => sectionContentErrors("tiktok_videos", content);

  it("accepts an empty section, so it can be added before its videos", () => {
    expect(errors({})).toEqual([]);
    expect(errors({ videos: [] })).toEqual([]);
  });

  it("accepts complete videos", () => {
    expect(errors({ direction: "right", videos: [video(), video({ buttonUrl: "https://example.com/x" })] })).toEqual([]);
  });

  it("requires every video to have a button link", () => {
    expect(errors({ videos: [video({ buttonUrl: undefined })] })).toEqual([
      "Video 1: add the button link (a page such as /shop, or an https:// address).",
    ]);
    expect(errors({ videos: [video({ buttonUrl: "  " })] })).toHaveLength(1);
  });

  it("refuses unsafe or odd button links", () => {
    for (const bad of ["javascript:alert(1)", "//evil.example", "/\\evil.example", "http://example.com", "shop"]) {
      expect(isAllowedLinkUrl(bad)).toBe(false);
      expect(errors({ videos: [video({ buttonUrl: bad })] })).toEqual([
        "Video 1: the button link must start with / or https://.",
      ]);
    }
  });

  it("requires the TikTok link and a cover from the library", () => {
    expect(errors({ videos: [video({ tiktokUrl: "https://vt.tiktok.com/ZSabc/" })] })).toEqual([
      "Video 1: paste the link to the video on TikTok.",
    ]);
    expect(errors({ videos: [video({ image: "" })] })).toEqual(["Video 1: pick a cover image."]);
    expect(errors({ videos: [video({ image: "https://p16.tiktokcdn.com/x.jpg" })] })).toEqual([
      "Video 1: pick the cover from the media library instead of pasting a link.",
    ]);
  });

  it("numbers each problem by video and caps the list", () => {
    const result = errors({ videos: [video(), video({ buttonUrl: "" }), video({ tiktokUrl: "" })] });
    expect(result[0]).toMatch(/^Video 2:/);
    expect(result[1]).toMatch(/^Video 3:/);
    expect(errors({ videos: Array.from({ length: 21 }, () => video()) })).toContain("Keep it to 20 videos or fewer.");
  });

  it("checks hooks in every language", () => {
    const long = "x".repeat(121);
    expect(errors({ videos: [video({ hook: { "en-US": "Fine", "zh-CN": long } })] })).toHaveLength(1);
  });

  it("leaves other section types alone", () => {
    expect(sectionContentErrors("custom_video", { videos: "nonsense" })).toEqual([]);
  });
});

describe("tiktok_videos per language", () => {
  const stored = {
    title: { "en-US": "Seen on TikTok" },
    direction: "right",
    videos: [
      video({ hook: { "en-US": "Side sleeper?", "zh-CN": "侧睡？" }, buttonLabel: { "en-US": "Customise yours" } }),
      video({ hook: { "en-US": "English only" } }),
    ],
  };

  it("keeps links, covers and direction in every language, and only that language's copy", () => {
    const zh = resolveContentLocale(stored, "zh-CN");
    expect(zh.title).toBeUndefined();
    expect(zh.direction).toBe("right");
    const videos = zh.videos as Array<Record<string, unknown>>;
    expect(videos).toHaveLength(2);
    expect(videos[0]).toMatchObject({ tiktokUrl: POST, image: COVER, buttonUrl: "/shop", hook: "侧睡？" });
    expect(videos[0].buttonLabel).toBeUndefined();
    // No Chinese hook: the video still shows, without one.
    expect(videos[1]).toMatchObject({ tiktokUrl: POST, buttonUrl: "/shop" });
    expect(videos[1].hook).toBeUndefined();
  });

  it("maps to cards with the visitor's language on internal links and a default button label", () => {
    const zh = resolveContentLocale(stored, "zh-CN");
    const cards = tiktokVideosFromContent(zh.videos, "zh-CN", "立即选购");
    expect(cards[0]).toEqual({
      id: "7301234567890123456",
      url: POST,
      cover: COVER,
      alt: undefined,
      hook: "侧睡？",
      buttonUrl: "/zh-CN/shop",
      buttonLabel: "立即选购",
    });

    const en = resolveContentLocale(stored, "en-US");
    expect(tiktokVideosFromContent(en.videos, "en-US", "Shop now")[0].buttonLabel).toBe("Customise yours");
  });

  it("leaves external links as they are and drops incomplete videos", () => {
    const cards = tiktokVideosFromContent(
      [video({ buttonUrl: "https://example.com/a" }), video({ buttonUrl: "" }), video({ tiktokUrl: "nope" }), null],
      "en-US",
      "Shop now",
    );
    expect(cards).toHaveLength(1);
    expect(cards[0].buttonUrl).toBe("https://example.com/a");
  });
});
