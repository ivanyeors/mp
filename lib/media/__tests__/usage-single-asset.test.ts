import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  listAssetUsages,
  listImageUsages,
  resolveUsages,
  usageOrFilter,
  usagePredicateTerms,
  type AssetRef,
  type UsageConsumerRows,
} from "@/lib/media/image-usages";
import { createFakeSupabase, makeUsageFixture } from "./usage-fixtures";

const h = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => h.client }));
vi.mock("@/lib/media/slide-media", () => ({
  getSlideMediaMap: () => ({}),
  SLIDE_PUBLIC_PATHS: [] as Array<{ publicPath: string; consumer: string }>,
}));

const ASSET: AssetRef = {
  id: "11111111-1111-4111-8111-111111111111",
  hosted_url: "https://cdn.example/media/hero.webp",
};

function asFetched(rows: UsageConsumerRows): UsageConsumerRows {
  return {
    ...rows,
    variants: (rows.variants ?? []).map((v) => ({ id: v.id, image_url: v.image_url })),
    orderItems: undefined,
  };
}

describe("usagePredicateTerms", () => {
  it("pushes id and URL predicates into the column-based tables", () => {
    expect(usagePredicateTerms("product_images", ASSET)).toEqual([
      { column: "media_asset_id", op: "eq", value: ASSET.id },
      { column: "url", op: "eq", value: ASSET.hosted_url },
    ]);
    expect(usagePredicateTerms("categories", ASSET)).toEqual([
      { column: "media_asset_id", op: "eq", value: ASSET.id },
      { column: "image_url", op: "eq", value: ASSET.hosted_url },
    ]);
    expect(usagePredicateTerms("partners", ASSET)).toEqual([
      { column: "media_asset_id", op: "eq", value: ASSET.id },
      { column: "logo_url", op: "eq", value: ASSET.hosted_url },
    ]);
    expect(usagePredicateTerms("item_overlay_mappings", ASSET)).toEqual([
      { column: "media_asset_id", op: "eq", value: ASSET.id },
    ]);
    expect(usagePredicateTerms("items", ASSET)).toEqual([
      { column: "primary_media_asset_id", op: "eq", value: ASSET.id },
    ]);
  });

  it("uses a text search on the JSON blob tables", () => {
    expect(usagePredicateTerms("landing_sections", ASSET)).toEqual([
      { column: "content::text", op: "ilike", value: `%${ASSET.id}%` },
      { column: "draft_content::text", op: "ilike", value: `%${ASSET.id}%` },
      { column: "content::text", op: "ilike", value: `%${ASSET.hosted_url}%` },
      { column: "draft_content::text", op: "ilike", value: `%${ASSET.hosted_url}%` },
    ]);
    expect(usagePredicateTerms("partners_page", ASSET)).toEqual([
      { column: "content::text", op: "ilike", value: `%${ASSET.id}%` },
      { column: "content::text", op: "ilike", value: `%${ASSET.hosted_url}%` },
    ]);
    expect(usagePredicateTerms("blog_posts", ASSET)).toEqual([
      { column: "media_asset_id", op: "eq", value: ASSET.id },
      { column: "content::text", op: "ilike", value: `%${ASSET.id}%` },
      { column: "image_url", op: "eq", value: ASSET.hosted_url },
      { column: "content::text", op: "ilike", value: `%${ASSET.hosted_url}%` },
    ]);
  });

  it("skips tables that cannot match, and only filters what it can express", () => {
    const idOnly: AssetRef = { id: ASSET.id, hosted_url: null };
    const urlOnly: AssetRef = { id: "", hosted_url: ASSET.hosted_url };

    expect(usagePredicateTerms("product_variants", idOnly)).toBeNull();
    expect(usagePredicateTerms("product_variants", ASSET)).toEqual([
      { column: "image_url", op: "eq", value: ASSET.hosted_url },
    ]);
    expect(usagePredicateTerms("blog_posts", urlOnly)).toEqual([]);
    expect(usagePredicateTerms("site_settings", urlOnly)).toEqual([]);
    expect(usagePredicateTerms("landing_sections", urlOnly)).toEqual([]);
    expect(usagePredicateTerms("items", urlOnly)).toBeNull();
    expect(usagePredicateTerms("product_images", urlOnly)).toEqual([
      { column: "url", op: "eq", value: ASSET.hosted_url },
    ]);
  });

  it("quotes only values that would break the or() list", () => {
    expect(usageOrFilter(usagePredicateTerms("categories", ASSET)!)).toBe(
      `media_asset_id.eq.${ASSET.id},image_url.eq.${ASSET.hosted_url}`,
    );
    expect(
      usageOrFilter([
        { column: "url", op: "eq", value: "https://cdn.example/a,b(c).webp" },
        { column: "content::text", op: "ilike", value: '%say "hi"%' },
      ]),
    ).toBe(
      'url.eq."https://cdn.example/a,b(c).webp",content::text.ilike."%say \\"hi\\"%"',
    );
  });
});

describe("single-asset usage equals the full scan", () => {
  beforeEach(() => {
    h.client = null;
  });

  it.each([101, 202, 303])("seed %i, every asset", async (seed) => {
    const { assets, tables, rows } = makeUsageFixture(seed, {
      assetCount: 24,
      rowsPerTable: 20,
    });
    const fake = createFakeSupabase(tables);
    h.client = fake.client;
    const reference = asFetched(rows);

    let matched = 0;
    for (const asset of assets) {
      const actual = await listAssetUsages(asset);
      const expected = resolveUsages(asset, reference);
      expect(actual).toEqual(expected);
      if (expected.length > 0) matched++;
    }
    expect(matched).toBeGreaterThan(3);
  });

  it("reads far fewer rows than a full scan", async () => {
    const { assets, tables } = makeUsageFixture(404, { assetCount: 24, rowsPerTable: 40 });
    const fake = createFakeSupabase(tables);
    h.client = fake.client;

    const asset = assets.find((a) => a.hosted_url)!;
    await listAssetUsages(asset);
    const scoped = fake.rowsRead();
    const totalRows = Object.values(tables).reduce((n, t) => n + t.length, 0);

    expect(scoped).toBeLessThan(totalRows / 4);
  });

  it("falls back to a full scan when PostgREST rejects the JSON cast", async () => {
    const { assets, tables, rows } = makeUsageFixture(505, { assetCount: 24, rowsPerTable: 20 });
    const fake = createFakeSupabase(tables, { rejectCastFilters: true });
    h.client = fake.client;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const reference = asFetched(rows);

    try {
      for (const asset of assets) {
        expect(await listAssetUsages(asset)).toEqual(resolveUsages(asset, reference));
      }
      expect(warn).toHaveBeenCalled();
      const sections = fake.log.filter((q) => q.table === "landing_sections");
      expect(sections.length).toBeGreaterThan(assets.length);
      expect(sections.some((q) => q.filters.some((f) => f.includes("content::text")))).toBe(true);
      expect(sections.some((q) => q.filters.length === 0)).toBe(true);
      expect(new Set(sections.map((q) => q.select))).toEqual(new Set(["id, slug, content, draft_content"]));
    } finally {
      warn.mockRestore();
    }
  });

  it("resolves a URL-only ref (delete precheck) exactly like the full scan", async () => {
    const { tables, rows } = makeUsageFixture(606, { assetCount: 16, rowsPerTable: 16 });
    const fake = createFakeSupabase(tables);
    h.client = fake.client;
    const reference = asFetched(rows);

    for (const url of [
      "https://cdn.example/storage/v1/object/public/media/img-1.webp",
      "https://cdn.example/storage/v1/object/public/media/img-3.webp",
      "https://cdn.example/storage/v1/object/public/media/never-used.webp",
    ]) {
      const actual = await listImageUsages(url);
      expect(actual).toEqual(resolveUsages({ id: "", hosted_url: url }, reference));
    }
  });

  afterEach(() => {
    h.client = null;
  });
});
