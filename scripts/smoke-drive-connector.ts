/**
 * Live smoke for slice 05 Drive connector.
 * Usage: npx tsx --env-file=.env.local scripts/smoke-drive-connector.ts
 */
import {
  DriveError,
  downloadFile,
  listFolder,
  listSharedDrives,
  resolveUrl,
} from "../lib/media-assets/drive";

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

async function main() {
  const drives = await listSharedDrives();
  console.log(
    "shared_drives:",
    drives.map((d) => ({ id: d.id, name: d.name })),
  );
  const hit = drives.find((d) => d.id === SHARED_DRIVE_ID);
  if (!hit) throw new Error(`Shared Drive ${SHARED_DRIVE_ID} not visible to sg@`);
  console.log("target_drive:", hit.name);

  const root = await listFolder({ driveId: SHARED_DRIVE_ID, pageSize: 10 });
  console.log(
    "root_items:",
    root.items.map((i) => ({ name: i.name, mimeType: i.mimeType, isFolder: i.isFolder })),
  );
  if (root.items.length === 0) throw new Error("Shared Drive root is empty");

  const page2 = await listFolder({
    driveId: SHARED_DRIVE_ID,
    pageSize: 1,
    pageToken: root.nextPageToken ?? undefined,
  });
  console.log("pagination_ok:", page2.items.length >= 0, "has_next:", !!root.nextPageToken);

  const img = await findImage(SHARED_DRIVE_ID, SHARED_DRIVE_ID);
  if (!img) throw new Error("No image found under Shared Drive");

  const pasteUrl = `https://drive.google.com/file/d/${img.id}/view?usp=sharing`;
  const resolved = await resolveUrl(pasteUrl);
  console.log("resolve:", {
    id: resolved.id,
    name: resolved.name,
    mimeType: resolved.mimeType,
    size: resolved.size,
    thumbnail: !!resolved.thumbnailLink,
  });
  if (resolved.id !== img.id) throw new Error("resolve id mismatch");

  const bytes = await downloadFile(resolved.id);
  console.log("download_bytes:", bytes.byteLength);
  if (bytes.byteLength < 1) throw new Error("empty download");

  try {
    await resolveUrl("https://example.com/not-drive");
    throw new Error("expected invalid_url");
  } catch (e) {
    if (!(e instanceof DriveError) || e.code !== "invalid_url") throw e;
  }

  try {
    await resolveUrl("https://drive.google.com/file/d/00000000000000000000000000000000/view");
    throw new Error("expected not_found");
  } catch (e) {
    if (!(e instanceof DriveError) || e.code !== "not_found") throw e;
  }

  console.log("SMOKE_OK");
}

main().catch((e) => {
  console.error("SMOKE_FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
