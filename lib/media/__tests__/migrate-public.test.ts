import { describe, it, expect } from "vitest";
import {
  DEFERRED_PUBLIC_PATHS,
  LANDING_PUBLIC_DEFAULTS,
  indexAssetsByPublicTag,
  isHostedUrl,
  isPublicPath,
  normalizePublicPath,
  planPublicMigration,
  publicPathTag,
} from "@/lib/media/migrate-public";

describe("migrate-public (slice 16)", () => {
  it("normalizes public paths and tags", () => {
    expect(normalizePublicPath("/Images/Foo.JPG")).toBe("/Images/Foo.JPG");
    expect(normalizePublicPath("images/foo.jpg")).toBe("/images/foo.jpg");
    expect(publicPathTag("/Images/Foo.JPG")).toBe("public:/images/foo.jpg");
    expect(publicPathTag("/images/foo.jpg")).toBe("public:/images/foo.jpg");
    expect(isPublicPath("/images/x.jpg")).toBe(true);
    expect(isPublicPath("//cdn.example/x")).toBe(false);
    expect(isHostedUrl("https://cdn.example/x.webp")).toBe(true);
    expect(isHostedUrl("/images/x.jpg")).toBe(false);
  });

  it("plans ingest for landing defaults when settings empty", () => {
    const plan = planPublicMigration({
      existingByTag: new Map(),
      deferred: [],
    });
    expect(plan.landing).toHaveLength(LANDING_PUBLIC_DEFAULTS.length);
    expect(plan.landing.every((l) => l.status === "write")).toBe(true);
    expect(plan.assets.every((a) => a.status === "ingest")).toBe(true);
    expect(plan.assets.length).toBe(
      new Set(LANDING_PUBLIC_DEFAULTS.map((d) => normalizePublicPath(d.publicPath))).size,
    );
  });

  it("reuses tagged Assets and skips already-hosted landing slots", () => {
    const path = normalizePublicPath("/m-pillow-417953-web.webp");
    const tag = publicPathTag(path);
    const existingByTag = new Map([
      [
        tag,
        {
          id: "asset-1",
          hosted_url: "https://cdn.example/hero.webp",
          tags: [tag],
        },
      ],
    ]);

    const plan = planPublicMigration({
      landingDefaults: [{ slotKey: "landing_hero", publicPath: path }],
      settings: [
        { key: "landing_hero", value: "https://cdn.example/hero.webp" },
        { key: "landing_hero_asset_id", value: "asset-1" },
      ],
      existingByTag,
      deferred: [],
    });

    expect(plan.landing).toEqual([
      {
        slotKey: "landing_hero",
        publicPath: path,
        status: "already_hosted",
        currentUrl: "https://cdn.example/hero.webp",
        currentAssetId: "asset-1",
      },
    ]);
    expect(plan.assets).toEqual([]);
  });

  it("plans blog rewrites for public paths; skips hosted+id", () => {
    const plan = planPublicMigration({
      landingDefaults: [],
      blogs: [
        {
          id: "b1",
          slug: "post-a",
          image_url: "/images/blogs/post-a.jpg",
          media_asset_id: null,
        },
        {
          id: "b2",
          slug: "post-b",
          image_url: "https://cdn.example/b.webp",
          media_asset_id: "asset-b",
        },
      ],
      existingByTag: new Map(),
      deferred: [],
    });

    expect(plan.blogs).toEqual([
      {
        blogId: "b1",
        slug: "post-a",
        publicPath: "/images/blogs/post-a.jpg",
        status: "write",
      },
      {
        blogId: "b2",
        slug: "post-b",
        publicPath: "https://cdn.example/b.webp",
        status: "already_hosted",
      },
    ]);
    expect(plan.assets).toEqual([
      { publicPath: "/images/blogs/post-a.jpg", status: "ingest" },
    ]);
  });

  it("reuses existing tagged asset for blog rewrite", () => {
    const path = "/images/blogs/post-a.jpg";
    const tag = publicPathTag(path);
    const plan = planPublicMigration({
      landingDefaults: [],
      blogs: [{ id: "b1", image_url: path, media_asset_id: null }],
      existingByTag: new Map([
        [tag, { id: "a1", hosted_url: "https://cdn.example/a.webp", tags: [tag] }],
      ]),
      deferred: [],
    });
    expect(plan.assets).toEqual([
      {
        publicPath: path,
        status: "reuse",
        assetId: "a1",
        hostedUrl: "https://cdn.example/a.webp",
      },
    ]);
  });

  it("indexes assets by public tag", () => {
    const map = indexAssetsByPublicTag([
      {
        id: "a1",
        hosted_url: "https://cdn.example/a.webp",
        tags: ["hero", "public:/images/a.jpg"],
      },
      { id: "a2", hosted_url: "https://cdn.example/b.webp", tags: ["other"] },
    ]);
    expect(map.get("public:/images/a.jpg")?.id).toBe("a1");
    expect(map.has("public:/images/b.jpg")).toBe(false);
  });

  it("exposes deferred slide/ambassadors inventory", () => {
    expect(DEFERRED_PUBLIC_PATHS.length).toBeGreaterThan(10);
    expect(DEFERRED_PUBLIC_PATHS.every((d) => d.reason.includes("slice 17"))).toBe(true);
  });
});
