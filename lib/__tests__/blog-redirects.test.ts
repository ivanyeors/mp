import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { NextRequest, type NextFetchEvent } from "next/server";
import { blogSlugFate, MERGED_BLOG_SLUGS, RETIRED_BLOG_SLUGS } from "@/lib/blog-redirects";

vi.mock("@/lib/supabase/middleware", () => ({ refreshSupabaseSession: vi.fn(async () => undefined) }));

const merged = Object.entries(MERGED_BLOG_SLUGS);

describe("blog consolidation map", () => {
  it("retires 12 posts and merges 59, with no slug in both", () => {
    expect(RETIRED_BLOG_SLUGS.size).toBe(12);
    expect(merged).toHaveLength(59);
    for (const [slug] of merged) expect(RETIRED_BLOG_SLUGS.has(slug)).toBe(false);
  });

  it("merges straight into a live post, never into another redirect", () => {
    for (const [, into] of merged) expect(blogSlugFate(into)).toBeNull();
  });

  it("knows nothing about live slugs or object keys", () => {
    expect(blogSlugFate("the-complete-guide-to-choosing-the-right-bolster-in-singapore")).toBeNull();
    expect(blogSlugFate("constructor")).toBeNull();
    expect(blogSlugFate("__proto__")).toBeNull();
  });
});

describe("internal links", () => {
  const live = new Set(readdirSync("data/blogs").filter((f) => f.endsWith(".mdx")).map((f) => f.slice(0, -4)));
  const sources = [
    "lib/seo/guides-content.ts",
    ...[...live].map((slug) => `data/blogs/${slug}.mdx`),
  ];

  it("only point at posts that exist and are not redirected", () => {
    const bad: string[] = [];
    for (const file of sources) {
      for (const [, slug] of readFileSync(file, "utf8").matchAll(/\/blog\/([a-z0-9-]+)/g)) {
        if (!live.has(slug) || blogSlugFate(slug)) bad.push(`${file} → ${slug}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("the local copy holds no merged or retired post", () => {
    expect([...live].filter((slug) => blogSlugFate(slug))).toEqual([]);
  });
});

describe("proxy", () => {
  const event = { waitUntil: () => undefined } as unknown as NextFetchEvent;
  const run = async (path: string) => {
    const { proxy } = await import("@/proxy");
    return proxy(new NextRequest(`https://custom.mpillow.com${path}`), event);
  };
  const [from, into] = merged[0];

  it("308s a merged post to the post that absorbed it, in the same locale", async () => {
    for (const lang of ["en-US", "zh-CN"]) {
      const res = await run(`/${lang}/blog/${from}`);
      expect(res.status).toBe(308);
      expect(new URL(res.headers.get("location")!).pathname).toBe(`/${lang}/blog/${into}`);
    }
  });

  it("answers a retired post with 410 Gone", async () => {
    const res = await run(`/en-US/blog/${[...RETIRED_BLOG_SLUGS][0]}`);
    expect(res.status).toBe(410);
    expect(await res.text()).toContain('href="/en-US/blog"');
  });

  it("lets live posts and malformed slugs through", async () => {
    expect((await run("/en-US/blog/the-complete-guide-to-choosing-the-right-bolster-in-singapore")).status).toBe(200);
    expect((await run("/en-US/blog/%E0%A4%A")).status).toBe(200);
  });
});
