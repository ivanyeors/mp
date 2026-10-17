import { describe, expect, it } from "vitest";
import { pickRelatedPosts } from "@/lib/blog-related";
import { resolveLocale, type BlogPost, type BlogPostRow } from "@/lib/blogs";

function post(slug: string, opts: Partial<BlogPost> = {}): BlogPost {
  return {
    id: slug, slug, status: "published", title: slug, sub_header: "", description: "", body: "",
    image_url: null, author: "Mpillow", published_at: "2025-01-01T00:00:00Z", created_at: "", updated_at: "",
    content_updated_at: null, seo_keywords: [], labels: [], content_locale: "en-US", locales: ["en-US"], ...opts,
  };
}

describe("related posts", () => {
  const current = post("the-complete-guide-to-choosing-the-right-bolster-in-singapore");

  it("prefers shared labels, then shared topic words, and never the post itself", () => {
    const related = pickRelatedPosts({ ...current, labels: ["Neck Pain"] }, [
      current,
      post("why-are-you-yawning-so-much", { published_at: "2026-06-01T00:00:00Z" }),
      post("how-a-bolster-can-help-with-neck-pain-relief"),
      post("tips-to-prevent-shoulder-pains-during-sleep", { labels: ["Neck Pain"] }),
    ]);
    expect(related.map((p) => p.slug)).toEqual([
      "tips-to-prevent-shoulder-pains-during-sleep",
      "how-a-bolster-can-help-with-neck-pain-relief",
      "why-are-you-yawning-so-much",
    ]);
  });

  it("ignores words every slug shares and fills with the newest", () => {
    const related = pickRelatedPosts(current, [
      post("how-to-choose-the-best-pillow-in-singapore"),
      post("is-a-memory-foam-pillow-ideal", { published_at: "2026-02-01T00:00:00Z" }),
    ], 1);
    expect(related.map((p) => p.slug)).toEqual(["is-a-memory-foam-pillow-ideal"]);
  });
});

describe("blog locale resolution", () => {
  const row = (content: BlogPostRow["content"]): BlogPostRow => ({
    id: "1", slug: "x", status: "published", content, image_url: null, author: "Mpillow",
    published_at: null, created_at: "", updated_at: "", labels: [],
  });
  const en = { title: "English", description: "", body: "Body" };

  it("reports the default locale when a translation is missing", () => {
    const p = resolveLocale(row({ "en-US": en }), "zh-CN");
    expect(p.title).toBe("English");
    expect(p.content_locale).toBe("en-US");
    expect(p.locales).toEqual(["en-US"]);
  });

  it("uses a real translation and ignores empty ones", () => {
    const zh = { title: "中文", description: "", body: "正文" };
    expect(resolveLocale(row({ "en-US": en, "zh-CN": zh }), "zh-CN").content_locale).toBe("zh-CN");
    const blank = resolveLocale(row({ "en-US": en, "zh-CN": { title: "", description: "", body: " " } }), "zh-CN");
    expect(blank.content_locale).toBe("en-US");
    expect(blank.locales).toEqual(["en-US"]);
  });
});
