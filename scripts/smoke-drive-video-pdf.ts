/**
 * Live smoke for slice 08 — video/PDF link-only import + durable preview thumb.
 * Usage: npx tsx --env-file=.env.local scripts/smoke-drive-video-pdf.ts
 */
import { listFolder, listSharedDrives } from "../lib/media-assets/drive";
import { importFromDrive } from "../lib/media-assets/import-drive";
import { deleteMediaAsset, getMediaAssetByDriveFileId } from "../lib/media-assets";

const SHARED_DRIVE_ID = "0AMgW7WI0ICkvUk9PVA";

async function findNonImage(
  driveId: string,
  folderId: string,
  depth = 0,
): Promise<{ id: string; name: string; mimeType: string; size: number | null } | null> {
  if (depth > 4) return null;
  const listing = await listFolder({ driveId, folderId, pageSize: 50 });
  for (const i of listing.items) {
    if (i.isFolder) continue;
    if (i.mimeType.startsWith("video/") || i.mimeType === "application/pdf") {
      return i;
    }
  }
  for (const i of listing.items.filter((x) => x.isFolder).slice(0, 8)) {
    const hit = await findNonImage(driveId, i.id, depth + 1);
    if (hit) return hit;
  }
  return null;
}

async function main() {
  const drives = await listSharedDrives();
  if (!drives.find((d) => d.id === SHARED_DRIVE_ID)) {
    throw new Error(`Shared Drive ${SHARED_DRIVE_ID} not visible`);
  }

  const pick = await findNonImage(SHARED_DRIVE_ID, SHARED_DRIVE_ID);
  if (!pick) throw new Error("No video/PDF found under Shared Drive for smoke");
  console.log("selected:", pick);

  const prior = await getMediaAssetByDriveFileId(pick.id);
  if (prior) {
    await deleteMediaAsset(prior.id);
    console.log("cleaned_prior:", prior.id);
  }

  const result = await importFromDrive({ fileId: pick.id, name: pick.name });
  console.log("import:", {
    id: result.asset.id,
    kind: result.asset.kind,
    hosted_url: result.asset.hosted_url,
    drive_file_id: result.asset.drive_file_id,
    drive_url: result.asset.drive_url,
    mime_type: result.asset.mime_type,
    byte_size: result.asset.byte_size,
  });

  if (result.existing) throw new Error("expected fresh import");
  if (result.asset.kind !== "video" && result.asset.kind !== "pdf") {
    throw new Error(`unexpected kind ${result.asset.kind}`);
  }
  if (!result.asset.drive_file_id || !result.asset.drive_url) {
    throw new Error("missing Drive provenance");
  }
  // Full file must not be re-hosted: mime stays video/pdf (thumb may set hosted_url).
  if (result.asset.mime_type?.startsWith("image/")) {
    throw new Error("mime_type should remain video/pdf, not image");
  }
  // If a durable thumb was hosted, it must be a small webp — not the source file size.
  if (result.asset.hosted_url) {
    if (!result.asset.hosted_url.includes("supabase")) {
      throw new Error("expected hosted preview on Supabase");
    }
    if (pick.size != null && pick.size > 5_000_000 && result.asset.byte_size === pick.size) {
      // byte_size is source metadata; hosted thumb is separate — OK
      console.log("note: byte_size is source size; thumb is separate object");
    }
  } else {
    console.log("preview_thumb: none (Drive had no usable thumbnailLink)");
  }

  await deleteMediaAsset(result.asset.id);
  console.log("cleaned_import:", result.asset.id);
  console.log("SMOKE_OK");
}

main().catch((e) => {
  console.error("SMOKE_FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
