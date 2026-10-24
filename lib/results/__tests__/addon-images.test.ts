import { describe, it, expect } from "vitest";
import { resolveAddonImageUrls } from "@/lib/results/addon-images";

const assets = [
  { id: "s", kind: "image", hosted_url: "https://cdn/cns-s.webp" },
  { id: "ear", kind: "image", hosted_url: "https://cdn/ear.webp" },
  { id: "vid", kind: "video", hosted_url: "https://cdn/v.mp4" },
];

describe("resolveAddonImageUrls", () => {
  it("gives a size with no image of its own its family's image", () => {
    // Production shape: only Cervical Neck Support S carries a photo.
    const urls = resolveAddonImageUrls(
      [
        { id: 66, primary_media_asset_id: null, family: "accessories:Cervical Neck Support" },
        { id: 61, primary_media_asset_id: "s", family: "accessories:Cervical Neck Support" },
        { id: 62, primary_media_asset_id: null, family: "accessories:Cervical Neck Support" },
        { id: 41, primary_media_asset_id: "ear", family: "accessories:Ear Comfort Pad" },
      ],
      assets,
    );
    expect(urls.get(62)).toBe("https://cdn/cns-s.webp");
    expect(urls.get(66)).toBe("https://cdn/cns-s.webp");
    expect(urls.get(41)).toBe("https://cdn/ear.webp");
  });

  it("keeps an Item's own image over its family's", () => {
    const urls = resolveAddonImageUrls(
      [
        { id: 1, primary_media_asset_id: "s", family: "f" },
        { id: 2, primary_media_asset_id: "ear", family: "f" },
      ],
      assets,
    );
    expect(urls.get(2)).toBe("https://cdn/ear.webp");
  });

  it("never borrows across families, nor from a non-image asset", () => {
    const urls = resolveAddonImageUrls(
      [
        { id: 1, primary_media_asset_id: "vid", family: "a" },
        { id: 2, primary_media_asset_id: null, family: "a" },
        { id: 3, primary_media_asset_id: null, family: "b" },
        { id: 4, primary_media_asset_id: null },
      ],
      assets,
    );
    expect([...urls.entries()]).toEqual([]);
  });
});
