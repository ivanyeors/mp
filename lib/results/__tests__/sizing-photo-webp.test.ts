import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { screenableImage } from "@/lib/ai/photo-screening";
import { sizingPhotoAsWebp } from "@/lib/results/sizing-photo-webp";

/** Sizing photos are stored as WebP (ADR 0047). */

/** A noisy photo-like JPEG, so the encoders have something to compress. */
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
    // Claude is given exactly the bytes that are stored.
    expect(screenableImage(stored!.dataUrl)).toEqual(stored!.image);
    const meta = await sharp(Buffer.from(stored!.image.base64, "base64")).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(2000);
    expect(stored!.byteSize).toBeLessThan(Buffer.byteLength(base64, "base64"));
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
