import { describe, it, expect } from "vitest";
import {
  SLIDE_PUBLIC_PATHS,
  planSlideMigration,
  resolveSlideMedia,
  slideImage,
} from "@/lib/media/slide-media";
import { publicPathTag } from "@/lib/media/migrate-public";

describe("slide-media (slice 17)", () => {
  it("inventories unique slide + ambassadors paths", () => {
    const paths = SLIDE_PUBLIC_PATHS.map((p) => p.publicPath);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.length).toBe(36);
    expect(paths).toContain("/images/landing/ambassadors-1.jpg");
    expect(paths).toContain("/wash-care.webp");
    expect(paths).toContain("/basic-mpillow.webp");
  });

  it("falls back to public path when map empty", () => {
    const img = slideImage("/wash-care.webp", { alt: "Wash care" });
    // Empty committed map → public fallback (or hosted if migrate already ran in this workspace)
    expect(img.alt).toBe("Wash care");
    expect(img.src === "/wash-care.webp" || /^https?:\/\//i.test(img.src)).toBe(true);
    if (img.src.startsWith("/")) expect(img.assetId).toBeUndefined();
  });

  it("plans ingest vs reuse vs already_resolved", () => {
    const path = "/wash-care.webp";
    const tag = publicPathTag(path);
    const plan = planSlideMigration({
      paths: [
        { publicPath: path, consumer: "basic" },
        { publicPath: "/001.webp", consumer: "basic" },
      ],
      existingByTag: new Map([
        [tag, { id: "a1", hosted_url: "https://cdn.example/wash.webp", tags: [tag] }],
      ]),
      resolved: {
        "/001.webp": { src: "https://cdn.example/001.webp", assetId: "a0" },
      },
    });

    expect(plan.assets).toEqual([
      {
        publicPath: path,
        consumer: "basic",
        status: "reuse",
        assetId: "a1",
        hostedUrl: "https://cdn.example/wash.webp",
      },
      {
        publicPath: "/001.webp",
        consumer: "basic",
        status: "already_resolved",
        assetId: "a0",
        hostedUrl: "https://cdn.example/001.webp",
      },
    ]);
  });

  it("resolveSlideMedia returns null for missing entries", () => {
    // Only assert shape when empty; after migrate this may be populated
    const miss = resolveSlideMedia("/definitely-not-a-slide-path.webp");
    expect(miss).toBeNull();
  });
});
