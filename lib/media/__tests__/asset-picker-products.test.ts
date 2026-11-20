import { describe, it, expect } from "vitest";
import { z } from "zod";
import { resolveUsages } from "@/lib/media/image-usages";

const CreateImageSchema = z.object({
  url: z.string().min(1),
  alt_text: z.string().nullable().optional().default(null),
  media_asset_id: z.string().uuid().nullable().optional().default(null),
  variant_id: z.string().uuid().nullable().optional().default(null),
  position: z.number().int().optional(),
});

describe("asset picker → product images (slice 11)", () => {
  it("accepts hybrid selection body with media_asset_id", () => {
    const parsed = CreateImageSchema.safeParse({
      url: "https://cdn.example/a.webp",
      alt_text: "Pillow",
      media_asset_id: "11111111-1111-4111-8111-111111111111",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.media_asset_id).toBe("11111111-1111-4111-8111-111111111111");
      expect(parsed.data.url).toBe("https://cdn.example/a.webp");
    }
  });

  it("still accepts legacy url-only body", () => {
    const parsed = CreateImageSchema.safeParse({ url: "https://cdn.example/legacy.webp" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.media_asset_id).toBeNull();
  });

  it("rejects invalid media_asset_id", () => {
    const parsed = CreateImageSchema.safeParse({
      url: "https://cdn.example/a.webp",
      media_asset_id: "not-a-uuid",
    });
    expect(parsed.success).toBe(false);
  });

  it("legacy product row (url only) still counts as used", () => {
    const usages = resolveUsages(
      { id: "asset-1", hosted_url: "https://cdn.example/legacy.webp" },
      {
        productImages: [
          {
            id: "pi1",
            product_id: "p1",
            url: "https://cdn.example/legacy.webp",
            media_asset_id: null,
          },
        ],
      },
    );
    expect(usages.some((u) => u.type === "product_image")).toBe(true);
  });

  it("product row with media_asset_id matches even when url differs", () => {
    const assetId = "22222222-2222-4222-8222-222222222222";
    const usages = resolveUsages(
      { id: assetId, hosted_url: "https://cdn.example/original.webp" },
      {
        productImages: [
          {
            id: "pi2",
            product_id: "p1",
            url: "https://cdn.example/display.webp",
            media_asset_id: assetId,
          },
        ],
      },
    );
    expect(usages).toEqual([
      expect.objectContaining({ type: "product_image", ref_id: "pi2" }),
    ]);
  });
});
