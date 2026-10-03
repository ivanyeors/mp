import { describe, expect, it } from "vitest";
import { planGalleryOp, type GalleryRow } from "../item-image-sync";

const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const img = (assetId: string) => ({ assetId, url: `https://x/${assetId}`, altText: null });
const row = (id: string, media_asset_id: string | null, position = 0): GalleryRow => ({ id, media_asset_id, position });

describe("planGalleryOp", () => {
  it("prepends a first image so it becomes Primary", () => {
    expect(planGalleryOp([row("r1", null)], null, img(A))).toEqual({ kind: "prepend" });
  });
  it("replaces the old item image in place, keeping its position", () => {
    expect(planGalleryOp([row("r1", null), row("r2", A, 1)], A, img(B))).toEqual({ kind: "replace", rowId: "r2" });
  });
  it("dedupes when the asset is already in the gallery", () => {
    expect(planGalleryOp([row("r1", A)], null, img(A))).toEqual({ kind: "none" });
  });
  it("drops the old row when the new asset is already present", () => {
    expect(planGalleryOp([row("r1", A), row("r2", B, 1)], A, img(B))).toEqual({ kind: "delete", rowId: "r1" });
  });
  it("deletes the item row when the image is cleared", () => {
    expect(planGalleryOp([row("r1", A)], A, null)).toEqual({ kind: "delete", rowId: "r1" });
    expect(planGalleryOp([row("r1", B)], A, null)).toEqual({ kind: "none" });
  });
});
