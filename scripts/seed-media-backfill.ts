/**
 * One-shot: backfill media_assets from the Supabase `media` bucket.
 * Usage: npx tsx --env-file=.env.local scripts/seed-media-backfill.ts
 */
import {
  backfillMediaAssetsFromBucket,
  listMediaAssets,
} from "../lib/media-assets";

async function main() {
  const result = await backfillMediaAssetsFromBucket();
  const assets = await listMediaAssets({ limit: 1000 });
  console.log("backfill:", result);
  console.log("media_assets_total:", assets.length);
  console.log("SEED_OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
