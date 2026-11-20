import type { ScreenableImage } from "@/lib/ai/photo-screening";
import { SIZING_PHOTO_MAX_EDGE } from "@/lib/images/shrink-photo";
import { optimizeImageForWeb } from "@/lib/media-assets/optimize";

export const SIZING_PHOTO_WEBP_QUALITY = 80;

export interface StoredSizingPhoto {
  image: ScreenableImage;
  dataUrl: string;
  byteSize: number;
}

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
