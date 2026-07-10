/**
 * Live smoke for slice 09 — rename, alt, re-import, delete guard.
 * Usage: npx tsx --env-file=.env.local scripts/smoke-drive-asset-detail.ts
 */
import {
  downloadFile,
  listFolder,
  listSharedDrives,
} from "../lib/media-assets/drive";
import { importFromDrive, reimportImageFromDrive } from "../lib/media-assets/import-drive";
import {
  deleteMediaAssetGuarded,
  getMediaAsset,
  getMediaAssetByDriveFileId,
  MediaAssetInUseError,
  updateMediaAsset,
} from "../lib/media-assets";
import { storagePathFromHostedUrl } from "../lib/media-assets/ingest";
import { supabaseAdmin } from "../lib/supabase/server";

const SHARED_DRIVE_ID = "0AMgW7WI0ICkvUk9PVA";
const SMOKE_SETTING_KEY = "landing_smoke_slice09";

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

async function main() {
  const drives = await listSharedDrives();
  if (!drives.find((d) => d.id === SHARED_DRIVE_ID)) {
    throw new Error(`Shared Drive ${SHARED_DRIVE_ID} not visible`);
  }

  const img = await findImage(SHARED_DRIVE_ID, SHARED_DRIVE_ID);
  if (!img) throw new Error("No image found under Shared Drive");

  const prior = await getMediaAssetByDriveFileId(img.id);
  if (prior) {
    await deleteMediaAssetGuarded(prior.id, { force: true });
    console.log("cleaned_prior:", prior.id);
  }

  const { asset: created } = await importFromDrive({ fileId: img.id });
  console.log("imported:", {
    id: created.id,
    hosted_url: created.hosted_url,
    drive_file_id: created.drive_file_id,
  });
  if (!created.hosted_url || !created.drive_file_id) {
    throw new Error("Expected hosted image Asset with Drive provenance");
  }

  const renamed = await updateMediaAsset(created.id, {
    name: "SMOKE_SLICE09_RENAME",
    alt_text: "smoke alt text",
  });
  console.log("renamed:", { name: renamed.name, alt_text: renamed.alt_text });
  if (renamed.name !== "SMOKE_SLICE09_RENAME" || renamed.alt_text !== "smoke alt text") {
    throw new Error("Rename/alt did not persist");
  }

  const beforePath = storagePathFromHostedUrl(created.hosted_url);
  const beforeBytes = await downloadFile(img.id);
  const reimported = await reimportImageFromDrive(created.id);
  console.log("reimported:", {
    hosted_url: reimported.hosted_url,
    imported_at: reimported.imported_at,
    byte_size: reimported.byte_size,
  });
  if (reimported.hosted_url !== created.hosted_url) {
    throw new Error("Re-import must keep hosted_url stable");
  }
  if (storagePathFromHostedUrl(reimported.hosted_url!) !== beforePath) {
    throw new Error("Re-import must upsert same storage path");
  }
  if (!reimported.imported_at) throw new Error("imported_at missing after re-import");
  console.log("drive_source_bytes:", beforeBytes.byteLength);

  // Attach temporarily so delete must block
  const admin = supabaseAdmin();
  await admin.from("site_settings").upsert({
    key: SMOKE_SETTING_KEY,
    value: created.hosted_url,
  });
  try {
    await deleteMediaAssetGuarded(created.id);
    throw new Error("Expected MediaAssetInUseError when attached");
  } catch (err) {
    if (!(err instanceof MediaAssetInUseError)) throw err;
    console.log("delete_blocked:", err.usages.map((u) => u.ref_id));
  }

  await deleteMediaAssetGuarded(created.id, { force: true });
  const gone = await getMediaAsset(created.id);
  if (gone) throw new Error("Asset still present after force delete");
  console.log("force_deleted: ok");

  await admin.from("site_settings").delete().eq("key", SMOKE_SETTING_KEY);
  console.log("SMOKE_OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
