import { describe, it, expect } from "vitest";
import {
  isMediaAssetKind,
  matchesFolderFilter,
  matchesKindFilter,
  matchesTagFilter,
  normalizeTags,
  planBucketBackfill,
  validateCreateMediaAsset,
  validateCreateMediaFolder,
  validateUpdateMediaAsset,
  validateUpdateMediaFolder,
  displayNameFromStoragePath,
} from "@/lib/media-assets";

describe("media-assets registry", () => {
  it("accepts kind enum", () => {
    expect(isMediaAssetKind("image")).toBe(true);
    expect(isMediaAssetKind("video")).toBe(true);
    expect(isMediaAssetKind("pdf")).toBe(true);
    expect(isMediaAssetKind("link")).toBe(true);
    expect(isMediaAssetKind("gif")).toBe(false);
    expect(isMediaAssetKind("")).toBe(false);
  });

  it("validates create", () => {
    expect(validateCreateMediaAsset({ kind: "image", name: "  ", hosted_url: "https://x" })).toBe(
      "Name is required",
    );
    expect(validateCreateMediaAsset({ kind: "image", name: "Hero" })).toBe(
      "Image assets require hosted_url",
    );
    expect(
      validateCreateMediaAsset({
        kind: "image",
        name: "Hero",
        hosted_url: "https://cdn.example/a.webp",
      }),
    ).toBeNull();
    expect(validateCreateMediaAsset({ kind: "video", name: "Demo" })).toBe(
      "Video/PDF assets require Drive provenance",
    );
    expect(
      validateCreateMediaAsset({
        kind: "pdf",
        name: "Spec",
        drive_file_id: "abc",
      }),
    ).toBeNull();
  });

  it("validates update", () => {
    expect(validateUpdateMediaAsset({})).toBe("No fields to update");
    expect(validateUpdateMediaAsset({ name: "  " })).toBe("Name cannot be empty");
    expect(validateUpdateMediaAsset({ name: "Renamed", alt_text: "alt" })).toBeNull();
    expect(validateUpdateMediaAsset({ alt_text: null })).toBeNull();
    expect(validateUpdateMediaAsset({ folder_id: null })).toBeNull();
    expect(validateUpdateMediaAsset({ folder_id: "  " })).toBe("Invalid folder_id");
    expect(validateUpdateMediaAsset({ folder_id: "abc" })).toBeNull();
    expect(validateUpdateMediaAsset({ tags: ["Hero", "hero", "  "] })).toBeNull();
    expect(validateUpdateMediaAsset({ tags: "hero" as unknown as string[] })).toBe("Invalid tags");
    expect(validateUpdateMediaAsset({ tags: [1 as unknown as string] })).toBe("Invalid tags");
    expect(validateUpdateMediaAsset({ tags: [] })).toBeNull();
  });

  it("normalizes tags", () => {
    expect(normalizeTags([" Hero ", "HERO", "2026-campaign", ""])).toEqual([
      "hero",
      "2026-campaign",
    ]);
    expect(normalizeTags([])).toEqual([]);
    expect(normalizeTags(null)).toBeNull();
  });

  it("validates folder create/rename", () => {
    expect(validateCreateMediaFolder({ name: "  " })).toBe("Name is required");
    expect(validateCreateMediaFolder({ name: "Campaign" })).toBeNull();
    expect(validateUpdateMediaFolder({ name: "" })).toBe("Name cannot be empty");
    expect(validateUpdateMediaFolder({ name: "Heroes" })).toBeNull();
  });

  it("matches folder filter", () => {
    expect(matchesFolderFilter(null)).toBe(true);
    expect(matchesFolderFilter("f1", { folder_id: "f1" })).toBe(true);
    expect(matchesFolderFilter("f2", { folder_id: "f1" })).toBe(false);
    expect(matchesFolderFilter(null, { unfiled: true })).toBe(true);
    expect(matchesFolderFilter("f1", { unfiled: true })).toBe(false);
  });

  it("matches kind filter", () => {
    expect(matchesKindFilter("image")).toBe(true);
    expect(matchesKindFilter("image", "all")).toBe(true);
    expect(matchesKindFilter("image", "image")).toBe(true);
    expect(matchesKindFilter("video", "image")).toBe(false);
    expect(matchesKindFilter("pdf", "pdf")).toBe(true);
  });

  it("matches tag filter", () => {
    expect(matchesTagFilter(["hero", "2026"])).toBe(true);
    expect(matchesTagFilter(["hero", "2026"], "hero")).toBe(true);
    expect(matchesTagFilter(["hero"], "Hero")).toBe(true);
    expect(matchesTagFilter(["hero"], "campaign")).toBe(false);
    expect(matchesTagFilter(null, "hero")).toBe(false);
    expect(matchesTagFilter([], "")).toBe(true);
  });

  it("backfill skips known hosted_urls (idempotent)", () => {
    const files = [
      { name: "a.webp", url: "https://cdn/a.webp" },
      { name: "b.webp", url: "https://cdn/b.webp" },
      { name: ".emptyFolderPlaceholder", url: "https://cdn/.empty" },
    ];
    const first = planBucketBackfill([], files);
    expect(first.toInsert).toHaveLength(2);
    expect(first.skipped).toBe(1);

    const second = planBucketBackfill(
      first.toInsert.map((r) => r.hosted_url!),
      files,
    );
    expect(second.toInsert).toHaveLength(0);
    expect(second.skipped).toBe(3);
  });

  it("displayNameFromStoragePath keeps basename", () => {
    expect(displayNameFromStoragePath("folder/x_123.webp")).toBe("x_123.webp");
  });
});
