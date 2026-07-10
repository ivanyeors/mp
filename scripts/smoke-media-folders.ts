/**
 * Live smoke for slice 13 — folder create/assign/filter/rename/unfile.
 * Usage: npx tsx --env-file=.env.local scripts/smoke-media-folders.ts
 */
import {
  createMediaAsset,
  createMediaFolder,
  deleteMediaAsset,
  deleteMediaFolder,
  listMediaAssets,
  listMediaFolders,
  updateMediaAsset,
  updateMediaFolder,
} from "../lib/media-assets";

const PREFIX = `SMOKE_S13_${Date.now()}`;

async function main() {
  const folderA = await createMediaFolder({ name: `${PREFIX}_A` });
  const folderB = await createMediaFolder({ name: `${PREFIX}_B` });
  console.log("folders_created:", { a: folderA.id, b: folderB.id });

  const listed = await listMediaFolders();
  if (!listed.find((f) => f.id === folderA.id) || !listed.find((f) => f.id === folderB.id)) {
    throw new Error("Created folders missing from list");
  }
  console.log("folders_list: ok");

  const asset = await createMediaAsset({
    kind: "image",
    name: `${PREFIX}_img`,
    hosted_url: `https://example.invalid/smoke/${PREFIX}.webp`,
  });
  if (asset.folder_id != null) throw new Error("New asset should be unfiled");
  console.log("asset_unfiled:", asset.id);

  const unfiled = await listMediaAssets({ unfiled: true });
  if (!unfiled.find((a) => a.id === asset.id)) throw new Error("Asset missing from unfiled filter");
  console.log("unfiled_filter: ok");

  const assigned = await updateMediaAsset(asset.id, { folder_id: folderA.id });
  if (assigned.folder_id !== folderA.id) throw new Error("Assign folder failed");
  console.log("assign: ok");

  const inA = await listMediaAssets({ folder_id: folderA.id });
  if (!inA.find((a) => a.id === asset.id)) throw new Error("Asset missing from folder A filter");
  const inB = await listMediaAssets({ folder_id: folderB.id });
  if (inB.find((a) => a.id === asset.id)) throw new Error("Asset should not be in folder B");
  console.log("folder_filter: ok");

  const moved = await updateMediaAsset(asset.id, { folder_id: folderB.id });
  if (moved.folder_id !== folderB.id) throw new Error("Move folder failed");
  console.log("move: ok");

  const renamed = await updateMediaFolder(folderA.id, { name: `${PREFIX}_A_renamed` });
  if (renamed.name !== `${PREFIX}_A_renamed`) throw new Error("Rename folder failed");
  console.log("rename: ok");

  const unfiledAgain = await updateMediaAsset(asset.id, { folder_id: null });
  if (unfiledAgain.folder_id != null) throw new Error("Unfile failed");
  console.log("unfile: ok");

  // cleanup
  await deleteMediaAsset(asset.id);
  await deleteMediaFolder(folderA.id);
  await deleteMediaFolder(folderB.id);
  console.log("cleanup: ok");
  console.log("SMOKE_OK");
}

main().catch((err) => {
  console.error("SMOKE_FAIL", err);
  process.exit(1);
});
