/**
 * Live smoke for slice 07 — browse Shared Drive → pick file → import (same path as dialog).
 * Usage: npx tsx --env-file=.env.local scripts/smoke-drive-browse-import.ts
 */
import {
  listFolder,
  listSharedDrives,
} from "../lib/media-assets/drive";
import { importFromDrive } from "../lib/media-assets/import-drive";
import { deleteMediaAsset, getMediaAssetByDriveFileId } from "../lib/media-assets";

const SHARED_DRIVE_ID = "0AMgW7WI0ICkvUk9PVA";

async function findImportable(
  driveId: string,
  folderId: string,
  depth = 0,
): Promise<{ id: string; name: string; mimeType: string; isFolder: boolean } | null> {
  if (depth > 3) return null;
  const listing = await listFolder({ driveId, folderId, pageSize: 50 });
  for (const i of listing.items) {
    if (i.isFolder) continue;
    if (
      i.mimeType.startsWith("image/") ||
      i.mimeType.startsWith("video/") ||
      i.mimeType === "application/pdf"
    ) {
      return i;
    }
  }
  for (const i of listing.items.filter((x) => x.isFolder).slice(0, 6)) {
    const hit = await findImportable(driveId, i.id, depth + 1);
    if (hit) return hit;
  }
  return null;
}

async function main() {
  // 1) Shared Drives list (dialog root)
  const drives = await listSharedDrives();
  console.log(
    "drives:",
    drives.map((d) => ({ id: d.id, name: d.name })),
  );
  const hit = drives.find((d) => d.id === SHARED_DRIVE_ID);
  if (!hit) throw new Error(`Shared Drive ${SHARED_DRIVE_ID} not visible`);

  // 2) Folder browse (dialog navigation)
  const root = await listFolder({ driveId: SHARED_DRIVE_ID, folderId: SHARED_DRIVE_ID, pageSize: 20 });
  console.log("root_items:", root.items.length, "next:", !!root.nextPageToken);
  if (root.items.length === 0) throw new Error("Shared Drive root empty");

  const folders = root.items.filter((i) => i.isFolder);
  const files = root.items.filter((i) => !i.isFolder);
  console.log("root_folders:", folders.length, "root_files:", files.length);

  // 3) Find an importable file (image preferred via depth walk)
  const pick = await findImportable(SHARED_DRIVE_ID, SHARED_DRIVE_ID);
  if (!pick) throw new Error("No importable file under Shared Drive");
  console.log("selected:", { id: pick.id, name: pick.name, mimeType: pick.mimeType });

  const prior = await getMediaAssetByDriveFileId(pick.id);
  if (prior) {
    await deleteMediaAsset(prior.id);
    console.log("cleaned_prior:", prior.id);
  }

  // 4) Import via orchestrator (same as dialog Import CTA → POST /api/media/import/drive)
  const result = await importFromDrive({ fileId: pick.id, name: pick.name });
  console.log("import:", {
    id: result.asset.id,
    kind: result.asset.kind,
    hosted_url: result.asset.hosted_url,
    drive_file_id: result.asset.drive_file_id,
    existing: result.existing,
  });

  if (result.existing) throw new Error("expected fresh import");
  if (result.asset.drive_file_id !== pick.id) throw new Error("drive_file_id mismatch");

  if (pick.mimeType.startsWith("image/")) {
    if (result.asset.kind !== "image") throw new Error("expected image kind");
    if (result.asset.mime_type !== "image/webp") throw new Error("expected WebP");
    if (!result.asset.hosted_url) throw new Error("expected hosted_url");
  } else {
    if (result.asset.hosted_url) throw new Error("link-only should have null hosted_url");
    if (result.asset.kind !== "video" && result.asset.kind !== "pdf") {
      throw new Error(`unexpected kind ${result.asset.kind}`);
    }
  }

  // 5) Idempotent re-import (dialog selecting same file again)
  const again = await importFromDrive({ fileId: pick.id });
  if (!again.existing || again.asset.id !== result.asset.id) {
    throw new Error("expected existing:true on re-import");
  }
  console.log("reimport_existing: true");

  await deleteMediaAsset(result.asset.id);
  console.log("cleaned_import:", result.asset.id);
  console.log("SMOKE_OK");
}

main().catch((e) => {
  console.error("SMOKE_FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
