import type { ScreenableImage } from "@/lib/ai/photo-screening";
import { SIZING_PHOTO_MAX_EDGE } from "@/lib/images/shrink-photo";
import { optimizeImageForWeb } from "@/lib/media-assets/optimize";

/**
 * Sizing photos are kept as WebP (ADR 0047). The phone sends a JPEG at most
 * 2,000 px on its long side (not every phone browser can write WebP); the
 * server converts it with the same sharp pipeline the Media library and Staff
 * reference photos use (`optimizeImageForWeb`): upright, metadata stripped,
 * long edge capped again in case a browser sent its original. Claude screens
 * the WebP, so what it checked is exactly what is stored. Server-only.
 */

export const SIZING_PHOTO_WEBP_QUALITY = 80;

export interface StoredSizingPhoto {
  /** The WebP, as Claude takes it. */
  image: ScreenableImage;
  /** The WebP, as `mp_config_response_photos.data_url` holds it. */
  dataUrl: string;
  byteSize: number;
}

/** `image` as the WebP that is stored; null when sharp can't read it. */
export async function sizingPhotoAsWebp(image: ScreenableImage): Promise<StoredSizingPhoto | null> {
  try {
    const out = await optimizeImageForWeb(Buffer.from(image.base64, "base64"), {
      longEdgeCap: SIZING_PHOTO_MAX_EDGE,
      quality: SIZING_PHOTO_WEBP_QUALITY,
    });
    if (!out.width || !out.height) return null;
    const base64 = out.buffer.toString("base64");
    return { image: { mediaType: "image/webp", base64 }, dataUrl: `data:image/webp;base64,${base64}`, byteSize: out.byteSize };
  } catch {
    return null;
  }
}
