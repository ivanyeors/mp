import { NextResponse } from "next/server";
import sharp from "sharp";
import { requireAdmin } from "@/lib/auth/admin";
import { DriveError, downloadFile, downloadThumbnail, driveErrorStatus, resolveUrl } from "@/lib/media-assets/drive";
import { fittingDriveFileId } from "@/lib/fitting-import/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const THUMB_EDGE = 640;
const FULL_EDGE = 1600;
const MAX_BYTES = 30 * 1024 * 1024;

const PRIVATE = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } as const;

const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: PRIVATE });

function sizedThumbnail(link: string, edge: number): string {
  return /=s\d+$/.test(link) ? link.replace(/=s\d+$/, `=s${edge}`) : link;
}

async function webp(input: Buffer, edge: number): Promise<Buffer> {
  return sharp(input, { failOn: "none" })
    .rotate()
    .resize({ width: edge, height: edge, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
}

const image = (body: Buffer, type: string) =>
  new NextResponse(new Uint8Array(body), { status: 200, headers: { ...PRIVATE, "Content-Type": type } });

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string; fittingId: string; index: string }> },
) {
  const denied = await requireAdmin("customers");
  if (denied) return denied;

  const { id, fittingId, index: rawIndex } = await params;
  const index = Number(rawIndex);
  if (!UUID.test(id) || !UUID.test(fittingId) || !/^\d{1,2}$/.test(rawIndex)) return fail(404, "File not found");
  const size = new URL(req.url).searchParams.get("size") === "full" ? "full" : "thumb";

  let fileId: string | null;
  try {
    fileId = await fittingDriveFileId(id, fittingId, index);
  } catch {
    return fail(500, "Could not read the fitting record");
  }
  if (!fileId) return fail(404, "File not found");

  try {
    const meta = await resolveUrl(fileId);
    if (meta.isFolder) return fail(415, "That is a folder, not a file");
    if (meta.size !== null && meta.size > MAX_BYTES) return fail(413, "The file is too big to preview");
    const isImage = meta.mimeType.startsWith("image/");

    if (size === "thumb") {
      const thumb = meta.thumbnailLink ? await downloadThumbnail(sizedThumbnail(meta.thumbnailLink, THUMB_EDGE)) : null;
      if (thumb) return image(await webp(thumb, THUMB_EDGE), "image/webp");
      if (!isImage) return fail(415, "Drive has no preview of this file");
      return image(await webp(await downloadFile(fileId), THUMB_EDGE), "image/webp");
    }

    if (isImage) return image(await webp(await downloadFile(fileId), FULL_EDGE), "image/webp");
    if (meta.mimeType === "application/pdf") {
      const pdf = await downloadFile(fileId);
      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: { ...PRIVATE, "Content-Type": "application/pdf", "Content-Disposition": "inline" },
      });
    }
    return fail(415, "Only images and PDFs can be previewed");
  } catch (e) {
    if (e instanceof DriveError) {
      const status = driveErrorStatus(e);
      return fail(status, status === 403 ? "The platform's Google account cannot open this Drive file" : "Drive could not give this file");
    }
    return fail(502, "Could not preview this file");
  }
}
