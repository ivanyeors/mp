import { describe, it, expect } from "vitest";
import {
  landingAssetIdKey,
  isLandingAssetIdKey,
  planReplaceEverywhere,
  replaceJsonRefs,
  type ReplaceInput,
} from "@/lib/media/replace";

const OLD_URL = "https://cdn.example/old.webp";
const NEW_URL = "https://cdn.example/new.webp";
const OLD_ID = "11111111-1111-4111-8111-111111111111";
const NEW_ID = "22222222-2222-4222-8222-222222222222";

const INPUT: ReplaceInput = {
  oldUrl: OLD_URL,
  newUrl: NEW_URL,
  oldAssetId: OLD_ID,
  newAssetId: NEW_ID,
};

describe("replace-everywhere (slice 15)", () => {
  it("landing dual-write key helpers", () => {
    expect(landingAssetIdKey("landing_hero")).toBe("landing_hero_asset_id");
    expect(isLandingAssetIdKey("landing_hero_asset_id")).toBe(true);
    expect(isLandingAssetIdKey("landing_hero")).toBe(false);
  });

  it("replaceJsonRefs swaps urls and media_asset_id", () => {
    const { value, changed } = replaceJsonRefs(
      {
        image: OLD_URL,
        media_asset_id: OLD_ID,
        nested: { body: `![x](${OLD_URL})` },
      },
      INPUT,
    );
    expect(changed).toBe(true);
    expect(value).toEqual({
      image: NEW_URL,
      media_asset_id: NEW_ID,
      nested: { body: `![x](${NEW_URL})` },
    });
  });

  it("updates all listed consumer types; leaves order_items unchanged", () => {
    const { rows, summary } = planReplaceEverywhere(
      {
        blogs: [
          {
            id: "b1",
            image_url: OLD_URL,
            content: { "en-US": { title: "A", body: "" } },
            media_asset_id: OLD_ID,
          },
          {
            id: "b2",
            image_url: null,
            content: { "en-US": { title: "B", body: `![x](${OLD_URL})` } },
            media_asset_id: null,
          },
        ],
        settings: [
          { key: "landing_hero", value: OLD_URL },
          { key: "landing_hero_asset_id", value: OLD_ID },
        ],
        landingSections: [
          { id: "ls1", content: { image: OLD_URL, media_asset_id: OLD_ID }, draft_content: null },
        ],
        productImages: [
          { id: "pi1", url: OLD_URL, media_asset_id: OLD_ID },
        ],
        variants: [{ id: "v1", image_url: OLD_URL, media_asset_id: null }],
        categories: [
          { id: "c1", image_url: OLD_URL, media_asset_id: OLD_ID },
        ],
        partners: [
          { id: "p1", logo_url: OLD_URL, media_asset_id: OLD_ID },
        ],
        partnersPages: [
          {
            id: "pp1",
            content: { "en-US": { heroImage: OLD_URL, media_asset_id: OLD_ID } },
          },
        ],
        orderItems: [{ id: "oi1", image_url: OLD_URL }],
      },
      INPUT,
    );

    expect(summary.blogFeatured).toBe(1);
    expect(summary.blogInline).toBe(1);
    expect(summary.landingSlots).toEqual(["landing_hero"]);
    expect(summary.landingSections).toBe(1);
    expect(summary.productImages).toBe(1);
    expect(summary.productVariants).toBe(1);
    expect(summary.categories).toBe(1);
    expect(summary.partners).toBe(1);
    expect(summary.partnersPages).toBe(1);

    expect(rows.blogs?.[0].image_url).toBe(NEW_URL);
    expect(rows.blogs?.[0].media_asset_id).toBe(NEW_ID);
    expect(JSON.stringify(rows.blogs?.[1].content)).toContain(NEW_URL);

    expect(rows.settings?.find((s) => s.key === "landing_hero")?.value).toBe(NEW_URL);
    expect(rows.settings?.find((s) => s.key === "landing_hero_asset_id")?.value).toBe(
      NEW_ID,
    );

    expect(rows.landingSections?.[0].content).toEqual({
      image: NEW_URL,
      media_asset_id: NEW_ID,
    });
    expect(rows.productImages?.[0]).toMatchObject({ url: NEW_URL, media_asset_id: NEW_ID });
    expect(rows.variants?.[0].image_url).toBe(NEW_URL);
    expect(rows.categories?.[0]).toMatchObject({
      image_url: NEW_URL,
      media_asset_id: NEW_ID,
    });
    expect(rows.partners?.[0]).toMatchObject({
      logo_url: NEW_URL,
      media_asset_id: NEW_ID,
    });
    expect(rows.partnersPages?.[0].content).toEqual({
      "en-US": { heroImage: NEW_URL, media_asset_id: NEW_ID },
    });

    // AC: order snapshots unchanged
    expect(rows.orderItems?.[0].image_url).toBe(OLD_URL);
  });

  it("url-only replace still works without asset ids", () => {
    const { rows, summary } = planReplaceEverywhere(
      {
        settings: [{ key: "landing_marquee", value: OLD_URL }],
        productImages: [{ id: "pi1", url: OLD_URL }],
      },
      { oldUrl: OLD_URL, newUrl: NEW_URL },
    );
    expect(summary.landingSlots).toEqual(["landing_marquee"]);
    expect(summary.productImages).toBe(1);
    expect(rows.settings?.[0].value).toBe(NEW_URL);
    // Companion id created only when newAssetId provided
    expect(rows.settings?.some((s) => s.key === "landing_marquee_asset_id")).toBe(false);
  });

  it("creates landing_*_asset_id companion when replacing with newAssetId", () => {
    const { rows } = planReplaceEverywhere(
      { settings: [{ key: "landing_founder", value: OLD_URL }] },
      INPUT,
    );
    expect(rows.settings?.find((s) => s.key === "landing_founder")?.value).toBe(NEW_URL);
    expect(rows.settings?.find((s) => s.key === "landing_founder_asset_id")?.value).toBe(
      NEW_ID,
    );
  });
});

describe("landing section drafts", () => {
  it("rewrites a pending draft, so the next publish does not revert the replacement", () => {
    const { rows, summary } = planReplaceEverywhere(
      {
        landingSections: [
          {
            id: "ls1",
            content: { image: "https://cdn.test/other.webp" },
            draft_content: { image: OLD_URL, media_asset_id: OLD_ID },
          },
        ],
      },
      INPUT,
    );

    expect(summary.landingSections).toBe(1);
    expect(rows.landingSections?.[0].draft_content).toEqual({
      image: NEW_URL,
      media_asset_id: NEW_ID,
    });
  });

  it("leaves a null draft null", () => {
    const { rows } = planReplaceEverywhere(
      {
        landingSections: [{ id: "ls1", content: { image: OLD_URL }, draft_content: null }],
      },
      INPUT,
    );

    expect(rows.landingSections?.[0].draft_content).toBeNull();
  });
});
