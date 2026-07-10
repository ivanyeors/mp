/**
 * Live smoke for slice 16 — `/public` → Asset migration (dry-run, apply, idempotent).
 * Usage: npx tsx --env-file=.env.local scripts/smoke-migrate-public-images.ts
 */
import fs from "fs/promises";
import {
  applyPublicMigration,
  formatPlanReport,
  repoPublicFilePath,
} from "../lib/media/migrate-public-apply";
import {
  LANDING_PUBLIC_DEFAULTS,
  publicPathTag,
} from "../lib/media/migrate-public";
import { landingAssetIdKey } from "../lib/media/replace";
import { listAssetUsages } from "../lib/media/image-usages";
import { listMediaAssets } from "../lib/media-assets";
import { supabaseAdmin } from "../lib/supabase/server";

async function main() {
  for (const { publicPath } of LANDING_PUBLIC_DEFAULTS) {
    await fs.access(repoPublicFilePath(publicPath));
  }
  console.log("landing_files: ok");

  const dry = await applyPublicMigration({ dryRun: true, landingOnly: true });
  console.log(formatPlanReport(dry.plan));
  if (dry.plan.landing.length !== LANDING_PUBLIC_DEFAULTS.length) {
    throw new Error("dry-run missing landing slots");
  }
  // Slice 17 adopted slide paths — deferred inventory is empty
  if (dry.plan.deferred.length !== 0) {
    throw new Error(`dry-run unexpected deferred: ${dry.plan.deferred.length}`);
  }
  console.log("dry_run: ok");

  const first = await applyPublicMigration({
    dryRun: false,
    landingOnly: true,
  });
  console.log("apply:", {
    ingested: first.ingested,
    reused: first.reused,
    landingWritten: first.landingWritten,
  });

  const writeExpected = dry.plan.landing.filter((l) => l.status === "write").length;
  if (first.landingWritten !== writeExpected) {
    throw new Error(
      `landing written ${first.landingWritten}, expected ${writeExpected}`,
    );
  }
  console.log("landing_apply: ok");

  const admin = supabaseAdmin();
  const keys = LANDING_PUBLIC_DEFAULTS.flatMap((d) => [
    d.slotKey,
    landingAssetIdKey(d.slotKey),
  ]);
  const { data: settings, error } = await admin
    .from("site_settings")
    .select("key,value")
    .in("key", keys);
  if (error) throw error;
  const byKey = new Map((settings ?? []).map((s) => [s.key, s.value as string]));

  for (const { slotKey } of LANDING_PUBLIC_DEFAULTS) {
    const url = byKey.get(slotKey);
    const assetId = byKey.get(landingAssetIdKey(slotKey));
    if (!url || !/^https?:\/\//i.test(url)) {
      throw new Error(`${slotKey} not hosted: ${url}`);
    }
    if (!assetId) throw new Error(`${slotKey} missing asset id`);
  }
  console.log("landing_dual_write: ok");

  const heroId = byKey.get(landingAssetIdKey("landing_hero"))!;
  const heroUrl = byKey.get("landing_hero")!;
  const usages = await listAssetUsages({ id: heroId, hosted_url: heroUrl });
  if (!usages.some((u) => u.type === "landing_slot" && u.ref_id === "landing_hero")) {
    throw new Error(`hero usage missing: ${JSON.stringify(usages)}`);
  }
  console.log("usage_after_migrate: ok");

  const second = await applyPublicMigration({ dryRun: false, landingOnly: true });
  if (second.ingested !== 0) {
    throw new Error(`re-apply ingested ${second.ingested} (expected 0)`);
  }
  if (second.landingWritten !== 0) {
    throw new Error(`re-apply wrote landing ${second.landingWritten} (expected 0)`);
  }
  console.log("idempotent: ok");

  const after = await listMediaAssets({ limit: 5000 });
  for (const { publicPath } of LANDING_PUBLIC_DEFAULTS) {
    const tag = publicPathTag(publicPath);
    const hit = after.find((a) => (a.tags ?? []).includes(tag));
    if (!hit) throw new Error(`missing tagged asset for ${publicPath}`);
  }
  console.log("landing_assets_tagged: ok");

  // One blog sample proves blog rewrite path (full blog migrate via --apply)
  const blogDry = await applyPublicMigration({ dryRun: true, blogLimit: 1 });
  const pending = blogDry.plan.blogs.filter((b) => b.status === "write");
  if (pending.length > 0) {
    const target = pending[0]!;
    const blogApply = await applyPublicMigration({ dryRun: false, blogLimit: 1 });
    if (blogApply.blogsWritten !== 1) {
      throw new Error(`expected 1 blog write, got ${blogApply.blogsWritten}`);
    }
    const { data: blogRow, error: blogErr } = await admin
      .from("blog_posts")
      .select("id,image_url,media_asset_id")
      .eq("id", target.blogId)
      .single();
    if (blogErr) throw blogErr;
    if (!blogRow?.image_url || !/^https?:\/\//i.test(blogRow.image_url)) {
      throw new Error(`blog ${target.blogId} not hosted: ${blogRow?.image_url}`);
    }
    if (!blogRow.media_asset_id) throw new Error(`blog ${target.blogId} missing asset id`);
    console.log("blog_sample: ok", { id: target.blogId });
  } else {
    console.log("blog_sample: already_migrated");
  }

  console.log("SMOKE_OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
