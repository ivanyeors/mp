/**
 * Live smoke for slice 17 — slide/ambassadors → Asset migration.
 * Usage: npx tsx --env-file=.env.local scripts/smoke-migrate-slide-images.ts
 */
import fs from "fs/promises";
import {
  applySlideMigration,
  formatSlidePlanReport,
  resolvedMapPath,
} from "../lib/media/migrate-slide-apply";
import { repoPublicFilePath } from "../lib/media/migrate-public-apply";
import {
  SLIDE_PUBLIC_PATHS,
  getSlideMediaMap,
  slideImage,
} from "../lib/media/slide-media";
import { publicPathTag } from "../lib/media/migrate-public";
import { listAssetUsages } from "../lib/media/image-usages";
import { listMediaAssets } from "../lib/media-assets";
import { basicMpillowSlideSections } from "../lib/product-slide-sections/configs/basic-mpillow";

async function main() {
  for (const { publicPath } of SLIDE_PUBLIC_PATHS) {
    await fs.access(repoPublicFilePath(publicPath));
  }
  console.log("slide_files: ok", { count: SLIDE_PUBLIC_PATHS.length });

  const dry = await applySlideMigration({ dryRun: true });
  console.log(formatSlidePlanReport(dry.plan));
  if (dry.plan.assets.length !== SLIDE_PUBLIC_PATHS.length) {
    throw new Error(
      `dry-run assets ${dry.plan.assets.length} != inventory ${SLIDE_PUBLIC_PATHS.length}`,
    );
  }
  console.log("dry_run: ok");

  const first = await applySlideMigration({ dryRun: false });
  console.log("apply:", {
    ingested: first.ingested,
    reused: first.reused,
    written: first.written,
  });
  if (Object.keys(first.map).length !== SLIDE_PUBLIC_PATHS.length) {
    throw new Error(
      `map size ${Object.keys(first.map).length} != ${SLIDE_PUBLIC_PATHS.length}`,
    );
  }
  console.log("slide_apply: ok");

  // Re-read map from disk (apply wrote it)
  const raw = await fs.readFile(resolvedMapPath(), "utf8");
  const diskMap = JSON.parse(raw) as Record<string, { src: string; assetId: string }>;
  for (const { publicPath } of SLIDE_PUBLIC_PATHS) {
    const hit = diskMap[publicPath];
    if (!hit?.src || !/^https?:\/\//i.test(hit.src)) {
      throw new Error(`${publicPath} not hosted on disk map: ${hit?.src}`);
    }
    if (!hit.assetId) throw new Error(`${publicPath} missing assetId`);
  }
  console.log("resolved_map: ok");

  // Configs resolve through slideImage (module may still hold pre-apply empty map in this process)
  // Assert disk map + that basic config uses slideImage wiring (src is string).
  const hero = basicMpillowSlideSections.find((s) => s.type === "split_hero");
  if (!hero || hero.type !== "split_hero" || !hero.image?.src) {
    throw new Error("basic hero image missing");
  }
  console.log("config_wired: ok", { sample: hero.image.src.slice(0, 48) });

  const samplePath = "/wash-care.webp";
  const sample = diskMap[samplePath]!;
  const usages = await listAssetUsages({ id: sample.assetId, hosted_url: sample.src });
  // listAssetUsages reads getSlideMediaMap() from the in-memory import — may be stale in this process.
  // Force check via resolveUsages path by re-importing after write is hard; assert tag + HEAD instead,
  // and call resolve with explicit rows if needed.
  const { resolveUsages } = await import("../lib/media/image-usages");
  const forced = resolveUsages(
    { id: sample.assetId, hosted_url: sample.src },
    {
      slideMedia: Object.entries(diskMap).map(([publicPath, v]) => ({
        publicPath,
        src: v.src,
        assetId: v.assetId,
        consumer: "smoke",
      })),
    },
  );
  if (!forced.some((u) => u.type === "slide_media" && u.ref_id === samplePath)) {
    throw new Error(`slide usage missing: ${JSON.stringify(forced)}`);
  }
  console.log("usage_slide_media: ok", { usages: usages.length, forced: forced.length });

  const head = await fetch(sample.src, { method: "HEAD" });
  if (!head.ok) throw new Error(`HEAD ${sample.src} → ${head.status}`);
  console.log("live_url: ok", { status: head.status, type: head.headers.get("content-type") });

  const second = await applySlideMigration({ dryRun: false });
  if (second.ingested !== 0) {
    throw new Error(`re-apply ingested ${second.ingested} (expected 0)`);
  }
  // already_resolved → written stays 0
  if (second.written !== 0) {
    throw new Error(`re-apply written ${second.written} (expected 0)`);
  }
  console.log("idempotent: ok");

  const after = await listMediaAssets({ limit: 5000 });
  for (const { publicPath } of SLIDE_PUBLIC_PATHS) {
    const tag = publicPathTag(publicPath);
    const hit = after.find((a) => (a.tags ?? []).includes(tag));
    if (!hit) throw new Error(`missing tagged asset for ${publicPath}`);
  }
  console.log("slide_assets_tagged: ok");

  // Sanity: slideImage helper still returns something usable
  const img = slideImage(samplePath, { alt: "x" });
  void getSlideMediaMap;
  console.log("slideImage_sample:", img.src.slice(0, 64));

  // Fresh process loads committed map (this process still has empty import cache)
  const { spawnSync } = await import("child_process");
  const verify = spawnSync(
    "npx",
    ["tsx", "--env-file=.env.local", "scripts/verify-slide-media-resolved.ts"],
    { cwd: process.cwd(), encoding: "utf8", shell: false },
  );
  if (verify.status !== 0) {
    console.error(verify.stdout);
    console.error(verify.stderr);
    throw new Error("verify-slide-media-resolved failed");
  }
  console.log(verify.stdout.trim().split("\n").pop());

  console.log("SMOKE_OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
