import { fitWithin } from "@/lib/images/shrink-photo";

export const UPLOAD_MAX_BYTES = 4_000_000;
export const UPLOAD_LONG_EDGE = 2400;

export type UploadedImage = {
  id: string;
  name: string;
  hosted_url: string;
  alt_text?: string | null;
  created_at: string;
  folder_id?: string | null;
  kind?: string;
  tags?: string[];
};

export type UploadImageResult = { ok: true; asset: UploadedImage } | { ok: false; error: string };

type Shrink = (file: File) => Promise<Blob | null>;

const megabytes = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

export const tooLargeToUpload = (file: Pick<File, "name" | "size">) =>
  `${file.name} is ${megabytes(file.size)}, which is too large to upload. Save it under ${megabytes(UPLOAD_MAX_BYTES)} and try again.`;

async function shrinkInBrowser(file: File): Promise<Blob | null> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, UPLOAD_LONG_EDGE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const type = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
    return await new Promise((resolve) => canvas.toBlob(resolve, type, 0.9));
  } finally {
    bitmap.close();
  }
}

export async function uploadImage(
  file: File,
  { shrink = shrinkInBrowser, send = fetch }: { shrink?: Shrink; send?: typeof fetch } = {},
): Promise<UploadImageResult> {
  if (!file.type.startsWith("image/")) return { ok: false, error: `${file.name} is not an image. Choose a JPG, PNG or WebP file.` };
  let body: Blob = file;
  if (file.size > UPLOAD_MAX_BYTES) {
    const smaller = await shrink(file).catch(() => null);
    if (!smaller || smaller.size > UPLOAD_MAX_BYTES) return { ok: false, error: tooLargeToUpload(file) };
    body = smaller;
  }
  const form = new FormData();
  form.append("file", body, file.name);
  try {
    const res = await send("/api/media", { method: "POST", body: form });
    if (res.status === 413) return { ok: false, error: tooLargeToUpload(file) };
    const data = await res.json().catch(() => null);
    if (data?.ok && data.asset?.id && data.asset.hosted_url) return { ok: true, asset: data.asset };
    return { ok: false, error: typeof data?.error === "string" && data.error.trim() ? data.error : `Couldn't upload ${file.name}.` };
  } catch {
    return { ok: false, error: `Couldn't upload ${file.name}. Check your connection and try again.` };
  }
}
