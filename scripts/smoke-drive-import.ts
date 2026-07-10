/**
 * Live smoke for slice 06 Drive import.
 * Usage: npx tsx --env-file=.env.local scripts/smoke-drive-import.ts
 */
import {
  downloadFile,
  listFolder,
  listSharedDrives,
  resolveUrl,
} from "../lib/media-assets/drive";
import { importFromDrive } from "../lib/media-assets/import-drive";
import { deleteMediaAsset, getMediaAssetByDriveFileId } from "../lib/media-assets";

const SHARED_DRIVE_ID = "0AMgW7WI0ICkvUk9PVA";

async function findImage(
  driveId: string,
  folderId: string,
  depth = 0,
): Promise<{ id: string; name: string; mimeType: string } | null> {
  if (depth > 3) return null;
  const listing = await listFolder({ driveId, folderId, pageSize: 50 });
  for (const i of listing.items) {
    if (!i.isFolder && i.mimeType.startsWith("image/")) return i;
  }
  for (const i of listing.items.filter((x) => x.isFolder).slice(0, 6)) {
    const hit = await findImage(driveId, i.id, depth + 1);
    if (hit) return hit;
  }
  return null;
}

async function findNonImage(
  driveId: string,
  folderId: string,
  depth = 0,
): Promise<{ id: string; name: string; mimeType: string } | null> {
  if (depth > 3) return null;
  const listing = await listFolder({ driveId, folderId, pageSize: 50 });
  for (const i of listing.items) {
    if (i.isFolder) continue;
    if (i.mimeType.startsWith("video/") || i.mimeType === "application/pdf") return i;
  }
  for (const i of listing.items.filter((x) => x.isFolder).slice(0, 6)) {
    const hit = await findNonImage(driveId, i.id, depth + 1);
    if (hit) return hit;
  }
  return null;
}

async function main() {
  const drives = await listSharedDrives();
  const hit = drives.find((d) => d.id === SHARED_DRIVE_ID);
  if (!hit) throw new Error(`Shared Drive ${SHARED_DRIVE_ID} not visible`);

  const img = await findImage(SHARED_DRIVE_ID, SHARED_DRIVE_ID);
  if (!img) throw new Error("No image found under Shared Drive");

  // Clean prior smoke import of this file if present
  const prior = await getMediaAssetByDriveFileId(img.id);
  if (prior) {
    await deleteMediaAsset(prior.id);
    console.log("cleaned_prior:", prior.id);
  }

  const pasteUrl = `https://drive.google.com/file/d/${img.id}/view?usp=sharing`;
  const resolved = await resolveUrl(pasteUrl);
  console.log("preview:", {
    id: resolved.id,
    name: resolved.name,
    mimeType: resolved.mimeType,
    thumbnail: !!resolved.thumbnailLink,
  });

  const bytes = await downloadFile(img.id);
  console.log("download_bytes:", bytes.byteLength);

  const first = await importFromDrive({ url: pasteUrl });
  console.log("import:", {
    id: first.asset.id,
    kind: first.asset.kind,
    hosted_url: first.asset.hosted_url,
    drive_file_id: first.asset.drive_file_id,
    mime_type: first.asset.mime_type,
    imported_at: first.asset.imported_at,
    existing: first.existing,
  });

  if (first.existing) throw new Error("expected fresh import");
  if (first.asset.kind !== "image") throw new Error("expected image kind");
  if (!first.asset.hosted_url?.includes(".webp") && first.asset.mime_type !== "image/webp") {
    // hosted path may not include .webp in URL query; mime is authoritative
    if (first.asset.mime_type !== "image/webp") throw new Error("expected WebP mime");
  }
  if (first.asset.mime_type !== "image/webp") throw new Error("expected WebP mime");
  if (first.asset.drive_file_id !== img.id) throw new Error("drive_file_id mismatch");
  if (!first.asset.imported_at) throw new Error("missing imported_at");
  if (!first.asset.hosted_url) throw new Error("missing hosted_url");

  const second = await importFromDrive({ fileId: img.id });
  console.log("reimport:", { id: second.asset.id, existing: second.existing });
  if (!second.existing) throw new Error("expected existing:true on re-import");
  if (second.asset.id !== first.asset.id) throw new Error("re-import id mismatch");

  const nonImage = await findNonImage(SHARED_DRIVE_ID, SHARED_DRIVE_ID);
  if (nonImage) {
    const priorLink = await getMediaAssetByDriveFileId(nonImage.id);
    if (priorLink) await deleteMediaAsset(priorLink.id);

    const link = await importFromDrive({ fileId: nonImage.id });
    console.log("link_import:", {
      id: link.asset.id,
      kind: link.asset.kind,
      hosted_url: link.asset.hosted_url,
      drive_file_id: link.asset.drive_file_id,
    });
    if (link.asset.hosted_url) throw new Error("link-only should have no hosted_url");
    if (!link.asset.drive_file_id) throw new Error("missing drive_file_id on link asset");
    if (link.asset.kind !== "video" && link.asset.kind !== "pdf") {
      throw new Error(`unexpected kind ${link.asset.kind}`);
    }
    await deleteMediaAsset(link.asset.id);
  } else {
    console.log("link_import: skipped (no video/pdf found)");
  }

  // Leave image Asset in library for UI verification, or clean up:
  await deleteMediaAsset(first.asset.id);
  console.log("cleaned_import:", first.asset.id);

  console.log("SMOKE_OK");
}

main().catch((e) => {
  console.error("SMOKE_FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
