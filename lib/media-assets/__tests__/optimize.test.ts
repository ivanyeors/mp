import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  IMAGE_LONG_EDGE_CAP,
  optimizeImageForWeb,
  optimizedStorageName,
} from "@/lib/media-assets/optimize";

describe("optimizeImageForWeb", () => {
  it("outputs WebP under long-edge cap and smaller than a large JPEG", async () => {
    const input = await sharp({
      create: {
        width: 3200,
        height: 2000,
        channels: 3,
        background: { r: 180, g: 90, b: 40 },
      },
    })
      .jpeg({ quality: 95 })
      .toBuffer();

    const out = await optimizeImageForWeb(input);

    expect(out.mimeType).toBe("image/webp");
    expect(out.extension).toBe("webp");
    expect(Math.max(out.width, out.height)).toBeLessThanOrEqual(IMAGE_LONG_EDGE_CAP);
    expect(out.byteSize).toBeLessThan(input.byteLength);
    expect(out.width).toBeGreaterThan(0);
    expect(out.height).toBeGreaterThan(0);

    const meta = await sharp(out.buffer).metadata();
    expect(meta.format).toBe("webp");
  });

  it("caps the long edge of a photo stored sideways, keeping its shape", async () => {
    // Stored 3200×2000 with an EXIF note to turn it a quarter: upright it is 2000×3200.
    const input = await sharp({ create: { width: 3200, height: 2000, channels: 3, background: { r: 180, g: 90, b: 40 } } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const out = await optimizeImageForWeb(input);
    expect([out.width, out.height]).toEqual([1500, IMAGE_LONG_EDGE_CAP]);
  });

  it("optimizedStorageName ends with .webp", () => {
    expect(optimizedStorageName("Hero Shot.PNG")).toMatch(/\.webp$/);
  });
});
