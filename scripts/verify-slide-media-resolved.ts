/**
 * Fresh-process verify after slide migrate (map must be on disk).
 * Usage: npx tsx --env-file=.env.local scripts/verify-slide-media-resolved.ts
 */
import { getSlideMediaMap, slideImage, SLIDE_PUBLIC_PATHS } from "../lib/media/slide-media";
import { listAssetUsages } from "../lib/media/image-usages";
import { applySlideMigration } from "../lib/media/migrate-slide-apply";
import { basicMpillowSlideSections } from "../lib/product-slide-sections/configs/basic-mpillow";

async function main() {
  const map = getSlideMediaMap();
  if (Object.keys(map).length !== SLIDE_PUBLIC_PATHS.length) {
    throw new Error(`map size ${Object.keys(map).length} != ${SLIDE_PUBLIC_PATHS.length}`);
  }
  for (const { publicPath } of SLIDE_PUBLIC_PATHS) {
    const hit = map[publicPath];
    if (!hit?.src || !/^https?:\/\//i.test(hit.src) || !hit.assetId) {
      throw new Error(`bad map entry ${publicPath}`);
    }
  }
  console.log("map_all_hosted: ok", Object.keys(map).length);

  const img = slideImage("/wash-care.webp", { alt: "x" });
  if (!/^https?:\/\//i.test(img.src) || !img.assetId) {
    throw new Error(`slideImage not hosted: ${img.src}`);
  }
  console.log("slideImage_hosted: ok");

  const hero = basicMpillowSlideSections.find((s) => s.type === "split_hero");
  if (!hero || hero.type !== "split_hero" || !/^https?:\/\//i.test(hero.image.src)) {
    throw new Error(`basic hero not hosted: ${hero && hero.type === "split_hero" ? hero.image.src : "?"}`);
  }
  console.log("basic_hero_hosted: ok");

  const usages = await listAssetUsages({ id: img.assetId, hosted_url: img.src });
  if (!usages.some((u) => u.type === "slide_media" && u.ref_id === "/wash-care.webp")) {
    throw new Error(`usage miss: ${JSON.stringify(usages)}`);
  }
  console.log("listAssetUsages_slide: ok");

  const head = await fetch(img.src, { method: "HEAD" });
  if (!head.ok) throw new Error(`HEAD ${head.status}`);
  console.log("live_url: ok", head.status, head.headers.get("content-type"));

  const dry = await applySlideMigration({ dryRun: true });
  const already = dry.plan.assets.filter((a) => a.status === "already_resolved").length;
  if (already !== 36) throw new Error(`already_resolved ${already}`);
  console.log("dry_already_resolved: ok");

  const re = await applySlideMigration({ dryRun: false });
  if (re.ingested !== 0 || re.written !== 0) {
    throw new Error(`not idempotent ${JSON.stringify({ ingested: re.ingested, written: re.written })}`);
  }
  console.log("reapply_idempotent: ok");
  console.log("VERIFY_OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
