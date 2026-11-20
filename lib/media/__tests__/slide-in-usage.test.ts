import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/media/slide-media", () => ({
  getSlideMediaMap: () => ({}),
  SLIDE_PUBLIC_PATHS: [] as Array<{ publicPath: string; consumer: string }>,
}));

const { indexUsages, resolveUsages } = await import("@/lib/media/image-usages");
const { planReplaceEverywhere } = await import("@/lib/media/replace");

const asset = { id: "asset-1", hosted_url: "https://irgxjthamhiaolvdfgar.supabase.co/storage/v1/object/public/media/a.webp" };

const rows = {
  slideInSections: [
    { id: "s1", page: "basic-mpillow", slug: "hero", content: { media: { image: { src: asset.hosted_url, assetId: asset.id } } }, draft_content: null },
    { id: "s2", page: "mbolster", slug: "story", content: {}, draft_content: { media: { images: [null, { src: "/x.webp", assetId: asset.id }] } } },
    { id: "s3", page: "mbolster", slug: "about", content: {}, draft_content: null },
  ],
};

describe("sub page images in the Media library", () => {
  it("are Used, by published content and by drafts", () => {
    const usages = resolveUsages(asset, rows);
    expect(usages).toEqual([
      { type: "slide_in_section", label: "Basic Mpillow · hero", ref_id: "s1" },
      { type: "slide_in_section", label: "Mbolster · story", ref_id: "s2" },
    ]);
    expect(indexUsages([asset], rows).byAssetId[asset.id]).toEqual(usages);
  });

  it("are rewritten by Replace everywhere, drafts too", () => {
    const { rows: out, summary } = planReplaceEverywhere(
      { slideInSections: rows.slideInSections },
      { oldUrl: asset.hosted_url, newUrl: "https://irgxjthamhiaolvdfgar.supabase.co/storage/v1/object/public/media/b.webp", oldAssetId: asset.id, newAssetId: "asset-2" },
    );
    expect(summary.slideInSections).toBe(2);
    expect(out.slideInSections?.[0]?.content).toEqual({
      media: { image: { src: "https://irgxjthamhiaolvdfgar.supabase.co/storage/v1/object/public/media/b.webp", assetId: "asset-2" } },
    });
    expect(out.slideInSections?.[1]?.draft_content).toEqual({ media: { images: [null, { src: "/x.webp", assetId: "asset-2" }] } });
  });
});
