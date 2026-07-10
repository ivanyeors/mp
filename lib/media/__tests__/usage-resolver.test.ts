import { describe, it, expect } from "vitest";
import {
  resolveUsages,
  jsonRefsAsset,
  type AssetRef,
  type UsageConsumerRows,
} from "@/lib/media/image-usages";

const ASSET: AssetRef = {
  id: "asset-1111-2222-3333-444444444444",
  hosted_url: "https://cdn.example/media/hero.webp",
};

const OTHER: AssetRef = {
  id: "asset-other",
  hosted_url: "https://cdn.example/media/other.webp",
};

describe("usage resolver", () => {
  it("matches hosted_url across consumers", () => {
    const url = ASSET.hosted_url!;
    const rows: UsageConsumerRows = {
      blogs: [
        {
          id: "b1",
          slug: "post",
          image_url: url,
          content: { "en-US": { title: "Hello", body: "" } },
        },
        {
          id: "b2",
          slug: "inline",
          image_url: null,
          content: {
            "en-US": { title: "Inline", body: `![x](${url})` },
          },
        },
      ],
      settings: [{ key: "landing_hero", value: url }],
      landingSections: [
        { id: "s1", slug: "hero", content: { image: url } },
      ],
      productImages: [
        { id: "pi1", product_id: "prod-aaaa-bbbb-cccc-dddddddddddd", url },
      ],
      variants: [
        {
          id: "v1",
          product_id: "prod-aaaa-bbbb-cccc-dddddddddddd",
          image_url: url,
        },
      ],
      categories: [{ id: "c1", slug: "pillows", image_url: url }],
      partners: [{ id: "p1", name: "Clinic", logo_url: url }],
      partnersPages: [
        { id: "pp1", content: { "en-US": { heroImage: url } } },
      ],
    };

    const usages = resolveUsages(ASSET, rows);
    const types = usages.map((u) => u.type).sort();
    expect(types).toEqual([
      "blog_featured",
      "blog_inline",
      "category",
      "landing_section",
      "landing_slot",
      "partner",
      "partners_page",
      "product_image",
      "product_variant",
    ]);
  });

  it("matches media_asset_id when present", () => {
    const rows: UsageConsumerRows = {
      blogs: [
        {
          id: "b1",
          slug: "by-id",
          image_url: null,
          media_asset_id: ASSET.id,
          content: { "en-US": { title: "By id" } },
        },
      ],
      productImages: [
        {
          id: "pi1",
          product_id: "prod-1",
          url: "https://cdn.example/legacy.png",
          media_asset_id: ASSET.id,
        },
      ],
      landingSections: [
        {
          id: "s1",
          slug: "custom",
          content: { media_asset_id: ASSET.id, image: "https://other" },
        },
      ],
    };

    const usages = resolveUsages(ASSET, rows);
    expect(usages.map((u) => u.type).sort()).toEqual([
      "blog_featured",
      "landing_section",
      "product_image",
    ]);
    expect(resolveUsages(OTHER, rows)).toHaveLength(0);
  });

  it("excludes order_items even when URL matches", () => {
    const rows: UsageConsumerRows = {
      orderItems: [
        { id: "oi1", image_url: ASSET.hosted_url },
        { id: "oi2", image_url: ASSET.hosted_url },
      ],
    };
    expect(resolveUsages(ASSET, rows)).toHaveLength(0);
  });

  it("jsonRefsAsset finds nested media_asset_id", () => {
    expect(
      jsonRefsAsset(
        { locales: { "en-US": { media_asset_id: ASSET.id } } },
        ASSET,
      ),
    ).toBe(true);
    expect(jsonRefsAsset({ image: OTHER.hosted_url }, ASSET)).toBe(false);
  });

  it("matches landing_*_asset_id dual-write companion", () => {
    const rows: UsageConsumerRows = {
      settings: [
        { key: "landing_hero", value: "https://cdn.example/display.webp" },
        { key: "landing_hero_asset_id", value: ASSET.id },
      ],
    };
    const usages = resolveUsages(ASSET, rows);
    expect(usages).toEqual([
      { type: "landing_slot", label: "Hero", ref_id: "landing_hero" },
    ]);
  });

  it("unused asset returns empty", () => {
    const rows: UsageConsumerRows = {
      settings: [{ key: "landing_hero", value: OTHER.hosted_url! }],
      orderItems: [{ id: "oi1", image_url: ASSET.hosted_url }],
    };
    expect(resolveUsages(ASSET, rows)).toHaveLength(0);
  });
});
