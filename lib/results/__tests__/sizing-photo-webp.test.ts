import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { screenableImage } from "@/lib/ai/photo-screening";
import { sizingPhotoAsWebp } from "@/lib/results/sizing-photo-webp";

async function jpeg(width: number, height: number): Promise<string> {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919) % 251;
  const buf = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 92 }).toBuffer();
  return buf.toString("base64");
}

describe("sizingPhotoAsWebp", () => {
  it("stores a JPEG as a smaller WebP, the long edge capped at 2,000 px", async () => {
    const base64 = await jpeg(2400, 1800);
    const stored = await sizingPhotoAsWebp({ mediaType: "image/jpeg", base64 });
    expect(stored).not.toBeNull();
    expect(stored!.dataUrl.startsWith("data:image/webp;base64,")).toBe(true);
    expect(screenableImage(stored!.dataUrl)).toEqual(stored!.image);
    const meta = await sharp(Buffer.from(stored!.image.base64, "base64")).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(2000);
    expect(stored!.byteSize).toBeLessThan(Buffer.byteLength(base64, "base64"));
  });

  it.each([
    ["landscape", 2400, 1800, 2000, 1500],
    ["portrait", 1800, 2400, 1500, 2000],
    ["wide", 3000, 1350, 2000, 900],
    ["already small", 1200, 900, 1200, 900],
  ])("keeps a %s photo's shape: %i×%i becomes %i×%i", async (_, width, height, outWidth, outHeight) => {
    const base64 = (await sharp({ create: { width, height, channels: 3, background: "#a86" } }).jpeg().toBuffer()).toString("base64");
    const stored = await sizingPhotoAsWebp({ mediaType: "image/jpeg", base64 });
    const meta = await sharp(Buffer.from(stored!.image.base64, "base64")).metadata();
    expect([meta.width, meta.height]).toEqual([outWidth, outHeight]);
  });

  it("turns a photo the phone saved sideways upright, keeping its shape", async () => {
    const base64 = (
      await sharp({ create: { width: 2400, height: 1800, channels: 3, background: "#a86" } })
        .jpeg()
        .withMetadata({ orientation: 6 })
        .toBuffer()
    ).toString("base64");
    const stored = await sizingPhotoAsWebp({ mediaType: "image/jpeg", base64 });
    const meta = await sharp(Buffer.from(stored!.image.base64, "base64")).metadata();
    expect([meta.width, meta.height]).toEqual([1500, 2000]);
    expect(meta.orientation).toBeUndefined();
  });

  it("drops the photo's metadata, location included", async () => {
    const base64 = (
      await sharp(Buffer.from(await jpeg(400, 300), "base64"))
        .withExifMerge({ IFD0: { Copyright: "sample", Make: "Phone" } })
        .jpeg()
        .toBuffer()
    ).toString("base64");
    expect((await sharp(Buffer.from(base64, "base64")).metadata()).exif).toBeDefined();
    const stored = await sizingPhotoAsWebp({ mediaType: "image/jpeg", base64 });
    expect((await sharp(Buffer.from(stored!.image.base64, "base64")).metadata()).exif).toBeUndefined();
  });

  it("returns null for bytes sharp can't read", async () => {
    const junk = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(40, 7)]).toString("base64");
    expect(await sizingPhotoAsWebp({ mediaType: "image/jpeg", base64: junk })).toBeNull();
  });
});
