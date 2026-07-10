/**
 * Live smoke for slice 04 / 18 — direct image upload → optimize → Asset.
 * Usage: npx tsx --env-file=.env.local scripts/smoke-direct-upload.ts
 */
import sharp from "sharp";
import { deleteMediaAssetGuarded } from "../lib/media-assets";
import { ingestImageAsset } from "../lib/media-assets/ingest";

async function main() {
  const bytes = await sharp({
    create: {
      width: 800,
      height: 600,
      channels: 3,
      background: { r: 40, g: 120, b: 180 },
    },
  })
    .png()
    .toBuffer();

  const { asset, storagePath } = await ingestImageAsset({
    bytes,
    originalName: `smoke-direct-upload-${Date.now()}.png`,
  });

  console.log("ingest:", {
    id: asset.id,
    mime: asset.mime_type,
    path: storagePath,
    w: asset.width,
    h: asset.height,
  });

  if (asset.kind !== "image") throw new Error("expected image kind");
  if (asset.mime_type !== "image/webp") throw new Error(`expected webp, got ${asset.mime_type}`);
  if (!asset.hosted_url?.includes("/storage/v1/object/public/media/")) {
    throw new Error(`unexpected hosted_url ${asset.hosted_url}`);
  }
  if (!storagePath.endsWith(".webp")) throw new Error(`storage path not webp: ${storagePath}`);

  const head = await fetch(asset.hosted_url, { method: "HEAD" });
  if (!head.ok) throw new Error(`HEAD ${head.status} ${asset.hosted_url}`);
  const ct = head.headers.get("content-type") ?? "";
  if (!ct.includes("image/webp")) throw new Error(`content-type ${ct}`);
  console.log("live_url: ok", { status: head.status, contentType: ct });

  await deleteMediaAssetGuarded(asset.id, { force: true });
  console.log("cleanup: ok");
  console.log("SMOKE_OK");
}

main().catch((err) => {
  console.error("SMOKE_FAIL", err instanceof Error ? err.message : err);
  process.exit(1);
});
