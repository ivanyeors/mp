import { describe, it, expect } from "vitest";
import {
  isMediaAssetKind,
  planBucketBackfill,
  validateCreateMediaAsset,
  validateUpdateMediaAsset,
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
