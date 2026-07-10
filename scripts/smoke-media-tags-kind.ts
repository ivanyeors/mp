/**
 * Live smoke for slice 14 — tags + kind filter (+ combine with folder).
 * Usage: npx tsx --env-file=.env.local scripts/smoke-media-tags-kind.ts
 */
import {
  createMediaAsset,
  createMediaFolder,
  deleteMediaAsset,
  deleteMediaFolder,
  listMediaAssets,
  updateMediaAsset,
} from "../lib/media-assets";

const PREFIX = `SMOKE_S14_${Date.now()}`;

async function main() {
  const folder = await createMediaFolder({ name: `${PREFIX}_folder` });

  const img = await createMediaAsset({
    kind: "image",
    name: `${PREFIX}_img`,
    hosted_url: `https://example.invalid/smoke/${PREFIX}.webp`,
  });
  const vid = await createMediaAsset({
    kind: "video",
    name: `${PREFIX}_vid`,
    drive_file_id: `${PREFIX}_vid_drive`,
    drive_url: `https://drive.google.com/file/d/${PREFIX}_vid_drive/view`,
  });
  const pdf = await createMediaAsset({
    kind: "pdf",
    name: `${PREFIX}_pdf`,
    drive_file_id: `${PREFIX}_pdf_drive`,
    drive_url: `https://drive.google.com/file/d/${PREFIX}_pdf_drive/view`,
  });
  console.log("assets_created:", { img: img.id, vid: vid.id, pdf: pdf.id });

  const tagged = await updateMediaAsset(img.id, { tags: ["Hero", "2026-campaign", "hero"] });
  if (JSON.stringify(tagged.tags) !== JSON.stringify(["hero", "2026-campaign"])) {
    throw new Error(`Tag normalize failed: ${JSON.stringify(tagged.tags)}`);
  }
  console.log("tag_set: ok");

  await updateMediaAsset(vid.id, { tags: ["hero"], folder_id: folder.id });
  await updateMediaAsset(pdf.id, { tags: ["spec"], folder_id: folder.id });

  const byHero = await listMediaAssets({ tag: "hero" });
  if (!byHero.find((a) => a.id === img.id) || !byHero.find((a) => a.id === vid.id)) {
    throw new Error("tag filter missing hero assets");
  }
  if (byHero.find((a) => a.id === pdf.id)) throw new Error("pdf should not match tag=hero");
  console.log("tag_filter: ok");

  const images = await listMediaAssets({ kind: "image" });
  if (!images.find((a) => a.id === img.id)) throw new Error("kind=image missing img");
  if (images.find((a) => a.id === vid.id)) throw new Error("kind=image should exclude video");
  console.log("kind_filter: ok");

  const videos = await listMediaAssets({ kind: "video" });
  if (!videos.find((a) => a.id === vid.id)) throw new Error("kind=video missing vid");
  console.log("kind_video: ok");

  const pdfs = await listMediaAssets({ kind: "pdf" });
  if (!pdfs.find((a) => a.id === pdf.id)) throw new Error("kind=pdf missing pdf");
  console.log("kind_pdf: ok");

  // Combined: folder + tag + kind
  const combined = await listMediaAssets({
    folder_id: folder.id,
    tag: "hero",
    kind: "video",
  });
  if (!combined.find((a) => a.id === vid.id)) throw new Error("combined filter missing vid");
  if (combined.find((a) => a.id === img.id) || combined.find((a) => a.id === pdf.id)) {
    throw new Error("combined filter leaked non-matching assets");
  }
  console.log("combined_filter: ok");

  const cleared = await updateMediaAsset(img.id, { tags: [] });
  if (cleared.tags.length !== 0) throw new Error("clear tags failed");
  const afterClear = await listMediaAssets({ tag: "hero" });
  if (afterClear.find((a) => a.id === img.id)) throw new Error("cleared tag still matches");
  console.log("tag_clear: ok");

  await deleteMediaAsset(img.id);
  await deleteMediaAsset(vid.id);
  await deleteMediaAsset(pdf.id);
  await deleteMediaFolder(folder.id);
  console.log("cleanup: ok");
  console.log("SMOKE_OK");
}

main().catch((err) => {
  console.error("SMOKE_FAIL", err);
  process.exit(1);
});
