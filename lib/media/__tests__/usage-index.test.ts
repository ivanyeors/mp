import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  indexUsages,
  resolveUsages,
  buildUsageMap,
  type AssetRef,
  type ImageUsageEntry,
  type UsageConsumerRows,
} from "@/lib/media/image-usages";
import { createFakeSupabase, makeUsageFixture } from "./usage-fixtures";

const h = vi.hoisted(() => ({ client: null as unknown }));

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => h.client }));
vi.mock("@/lib/media/slide-media", () => ({
  getSlideMediaMap: () => ({}),
  SLIDE_PUBLIC_PATHS: [] as Array<{ publicPath: string; consumer: string }>,
}));

/**
 * Reference copy of the pre-inversion `indexUsages`: one full `resolveUsages`
 * scan per asset, O(assets × rows). The inverted implementation must agree with
 * it exactly — same usages, same order, same labels and kinds.
 */
function indexUsagesReference(
  assets: AssetRef[],
  rows: UsageConsumerRows,
): { byUrl: Record<string, ImageUsageEntry[]>; byAssetId: Record<string, ImageUsageEntry[]> } {
  const byUrl: Record<string, ImageUsageEntry[]> = {};
  const byAssetId: Record<string, ImageUsageEntry[]> = {};
  for (const asset of assets) {
    const list = resolveUsages(asset, rows);
    if (list.length === 0) continue;
    byAssetId[asset.id] = list;
    if (asset.hosted_url) byUrl[asset.hosted_url] = list;
  }
  return { byUrl, byAssetId };
}

describe("indexUsages (inverted) equals the per-asset scan", () => {
  const seeds = [1, 2, 3, 7, 11, 42, 1337, 90210];

  it.each(seeds)("seed %i", (seed) => {
    const { assets, rows } = makeUsageFixture(seed, { assetCount: 40, rowsPerTable: 24 });
    expect(assets.length).toBeGreaterThan(30);

    const actual = indexUsages(assets, rows);
    const expected = indexUsagesReference(assets, rows);

    expect(actual).toEqual(expected);
    // The fixture must actually produce usages, or the equality is vacuous.
    expect(Object.keys(expected.byAssetId).length).toBeGreaterThan(5);
  });

  it("agrees over a few hundred rows and assets", () => {
    const { assets, rows } = makeUsageFixture(2026, { assetCount: 150, rowsPerTable: 60 });
    const rowCount = Object.values(rows).reduce(
      (n, list) => n + (Array.isArray(list) ? list.length : 0),
      0,
    );
    expect(rowCount).toBeGreaterThan(300);
    expect(indexUsages(assets, rows)).toEqual(indexUsagesReference(assets, rows));
  });

  it("preserves ordering within an asset (consumer-row iteration order)", () => {
    const asset: AssetRef = { id: "11111111-1111-4111-8111-111111111111", hosted_url: "https://cdn.example/a.webp" };
    const rows: UsageConsumerRows = {
      blogs: [
        {
          id: "b1",
          slug: "post",
          image_url: asset.hosted_url,
          content: { "en-US": { title: "T", body: `![x](${asset.hosted_url})` } },
        },
      ],
      settings: [{ key: "landing_hero", value: asset.hosted_url! }],
      landingSections: [{ id: "s1", slug: "hero", content: { image: asset.hosted_url } }],
      productImages: [{ id: "pi1", product_id: "prod-abcdefgh", url: asset.hosted_url! }],
      variants: [{ id: "v1", image_url: asset.hosted_url }],
      categories: [{ id: "c1", slug: "cat", image_url: asset.hosted_url }],
      partners: [{ id: "pt1", name: "P", logo_url: asset.hosted_url }],
      partnersPages: [{ id: "pp1", content: [asset.hosted_url] }],
      itemOverlays: [{ item_id: 5, media_asset_id: asset.id, item_name: "Cover" }],
      items: [{ id: 5, name: "Item", primary_media_asset_id: asset.id }],
      slideMedia: [{ publicPath: "/x.webp", src: asset.hosted_url!, assetId: asset.id }],
    };

    const list = indexUsages([asset], rows).byAssetId[asset.id];
    expect(list.map((u) => u.type)).toEqual([
      "blog_featured",
      "blog_inline",
      "landing_slot",
      "landing_section",
      "product_image",
      "product_variant",
      "category",
      "partner",
      "partners_page",
      "item_overlay",
      "item_image",
      "slide_media",
    ]);
    expect(list).toEqual(resolveUsages(asset, rows));
  });

  it("handles the degenerate empty-id ref exactly like the direct scan", () => {
    const { rows } = makeUsageFixture(5, { assetCount: 12, rowsPerTable: 10 });
    const urlOnly: AssetRef[] = [
      { id: "", hosted_url: "https://cdn.example/storage/v1/object/public/media/img-1.webp" },
      { id: "", hosted_url: null },
    ];
    expect(indexUsages(urlOnly, rows)).toEqual(indexUsagesReference(urlOnly, rows));
  });

  it("matches substring URL refs without matching a longer sibling URL", () => {
    const short: AssetRef = { id: "aaaa1111-1111-4111-8111-111111111111", hosted_url: "https://cdn.example/hero.webp" };
    const long: AssetRef = { id: "bbbb2222-2222-4222-8222-222222222222", hosted_url: "https://cdn.example/hero.webp?v=2" };
    const rows: UsageConsumerRows = {
      landingSections: [{ id: "s1", slug: "hero", content: { image: long.hosted_url } }],
      settings: [{ key: "landing_hero", value: `url(${long.hosted_url})` }],
    };
    const actual = indexUsages([short, long], rows);
    expect(actual).toEqual(indexUsagesReference([short, long], rows));
    // short's URL is a substring of long's, so it matches the JSON walk too.
    expect(actual.byAssetId[short.id]?.map((u) => u.type)).toEqual([
      "landing_slot",
      "landing_section",
    ]);
  });
});

describe("buildUsageMap over the trimmed selects", () => {
  beforeEach(() => {
    h.client = null;
  });

  it("equals the reference scan of the untrimmed rows", async () => {
    const { assets, tables, rows } = makeUsageFixture(77, { assetCount: 60, rowsPerTable: 30 });
    const fake = createFakeSupabase(tables);
    h.client = fake.client;

    const usageMap = await buildUsageMap(assets);

    // Reference rows keep `product_variants.product_id` (which the trimmed
    // select drops, and no matcher reads) but not `media_asset_id`, which this
    // table never selected. Equality then proves the trim dropped nothing the
    // matchers use.
    const asFetched: UsageConsumerRows = {
      ...rows,
      variants: (rows.variants ?? []).map((v) => ({
        id: v.id,
        product_id: v.product_id,
        image_url: v.image_url,
      })),
    };
    expect(usageMap).toEqual(indexUsagesReference(assets, asFetched).byUrl);
    expect(Object.keys(usageMap).length).toBeGreaterThan(0);
  });

  it("issues exactly one unfiltered query per consumer table", async () => {
    const { assets, tables } = makeUsageFixture(78, { assetCount: 10, rowsPerTable: 8 });
    const fake = createFakeSupabase(tables);
    h.client = fake.client;

    await buildUsageMap(assets);

    expect(fake.log.map((q) => q.table).sort()).toEqual([
      "blog_posts",
      "categories",
      "item_overlay_mappings",
      "items",
      "landing_sections",
      "partners",
      "partners_page",
      "product_images",
      "product_variants",
      "site_settings",
    ]);
    const variants = fake.log.find((q) => q.table === "product_variants");
    expect(variants?.select).toBe("id, image_url");
    const settings = fake.log.find((q) => q.table === "site_settings");
    expect(settings?.filters).toEqual(["key.like.landing_%"]);
  });
});
