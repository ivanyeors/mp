import fs from "fs/promises";
import path from "path";
import {
  indexAssetsByPublicTag,
  isPublicPath,
  normalizePublicPath,
  planPublicMigration,
  publicPathTag,
  type ExistingPublicAsset,
  type PublicMigrationPlan,
} from "@/lib/media/migrate-public";
import { landingAssetIdKey } from "@/lib/media/replace";
import {
  listMediaAssets,
  updateMediaAsset,
  type MediaAsset,
} from "@/lib/media-assets";
import { ingestImageAsset } from "@/lib/media-assets/ingest";
import { supabaseAdmin } from "@/lib/supabase/server";

export type ApplyPublicMigrationResult = {
  plan: PublicMigrationPlan;
  ingested: number;
  reused: number;
  landingWritten: number;
  blogsWritten: number;
  pathToAsset: Map<string, { id: string; hosted_url: string }>;
};

export async function loadPublicMigrationContext(): Promise<{
  plan: PublicMigrationPlan;
  assets: MediaAsset[];
}> {
  const admin = supabaseAdmin();
  const [assets, settingsRes, blogsRes] = await Promise.all([
    listMediaAssets({ limit: 5000 }),
    admin.from("site_settings").select("key,value").like("key", "landing_%"),
    admin.from("blog_posts").select("id,slug,image_url,media_asset_id"),
  ]);
  if (settingsRes.error) throw new Error(settingsRes.error.message);
  if (blogsRes.error) throw new Error(blogsRes.error.message);

  const existingByTag = indexAssetsByPublicTag(assets);
  const plan = planPublicMigration({
    settings: (settingsRes.data ?? []) as Array<{ key: string; value: string }>,
    blogs: (blogsRes.data ?? []) as Array<{
      id: string;
      slug?: string;
      image_url: string | null;
      media_asset_id?: string | null;
    }>,
    existingByTag,
  });

  return { plan, assets };
}

export function repoPublicFilePath(publicPath: string, cwd = process.cwd()): string {
  const rel = normalizePublicPath(publicPath).replace(/^\//, "");
  return path.join(cwd, "public", rel);
}

async function ensureAssetForPath(
  publicPath: string,
  cache: Map<string, { id: string; hosted_url: string }>,
  existingByTag: Map<string, ExistingPublicAsset>,
): Promise<{ id: string; hosted_url: string; ingested: boolean }> {
  const norm = normalizePublicPath(publicPath);
  const cached = cache.get(norm);
  if (cached) return { ...cached, ingested: false };

  const tag = publicPathTag(norm);
  const existing = existingByTag.get(tag);
  if (existing) {
    cache.set(norm, { id: existing.id, hosted_url: existing.hosted_url });
    return { id: existing.id, hosted_url: existing.hosted_url, ingested: false };
  }

  const filePath = repoPublicFilePath(norm);
  const bytes = await fs.readFile(filePath);
  const originalName = path.basename(norm);
  const { asset } = await ingestImageAsset({
    bytes,
    originalName,
    imported_at: new Date().toISOString(),
  });
  const tagged = await updateMediaAsset(asset.id, {
    tags: [...(asset.tags ?? []), tag],
  });
  const hosted = tagged.hosted_url ?? asset.hosted_url;
  if (!hosted) throw new Error(`Ingested asset missing hosted_url for ${norm}`);

  const ref = { id: tagged.id, hosted_url: hosted };
  cache.set(norm, ref);
  existingByTag.set(tag, { ...ref, tags: tagged.tags });
  return { ...ref, ingested: true };
}

function scopePlan(
  plan: PublicMigrationPlan,
  opts?: { blogLimit?: number; landingOnly?: boolean },
): PublicMigrationPlan {
  let blogs = plan.blogs;
  if (opts?.landingOnly) blogs = [];
  else if (opts?.blogLimit != null) {
    const writes = blogs.filter((b) => b.status === "write").slice(0, opts.blogLimit);
    const skips = blogs.filter((b) => b.status === "already_hosted");
    blogs = [...writes, ...skips];
  }

  const needed = new Set<string>();
  for (const l of plan.landing) {
    if (l.status === "write") needed.add(l.publicPath);
  }
  for (const b of blogs) {
    if (b.status === "write") needed.add(b.publicPath);
  }

  const assets = plan.assets.filter((a) => needed.has(a.publicPath));
  return { ...plan, blogs, assets };
}

export async function applyPublicMigration(opts?: {
  dryRun?: boolean;
  blogLimit?: number;
  landingOnly?: boolean;
}): Promise<ApplyPublicMigrationResult> {
  const dryRun = opts?.dryRun ?? false;
  const { plan: fullPlan, assets } = await loadPublicMigrationContext();
  const plan = scopePlan(fullPlan, opts);
  const pathToAsset = new Map<string, { id: string; hosted_url: string }>();
  const existingByTag = indexAssetsByPublicTag(assets);

  if (dryRun) {
    return {
      plan,
      ingested: plan.assets.filter((a) => a.status === "ingest").length,
      reused: plan.assets.filter((a) => a.status === "reuse").length,
      landingWritten: 0,
      blogsWritten: 0,
      pathToAsset,
    };
  }

  let ingested = 0;
  let reused = 0;

  for (const a of plan.assets) {
    const result = await ensureAssetForPath(a.publicPath, pathToAsset, existingByTag);
    if (result.ingested) ingested++;
    else reused++;
  }

  const admin = supabaseAdmin();
  const now = new Date().toISOString();
  let landingWritten = 0;

  for (const l of plan.landing) {
    if (l.status !== "write") continue;
    const asset = pathToAsset.get(l.publicPath);
    if (!asset) throw new Error(`Missing asset for landing ${l.slotKey}`);
    const idKey = landingAssetIdKey(l.slotKey);
    const { error } = await admin.from("site_settings").upsert(
      [
        { key: l.slotKey, value: asset.hosted_url, updated_at: now },
        { key: idKey, value: asset.id, updated_at: now },
      ],
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    landingWritten++;
  }

  let blogsWritten = 0;
  for (const b of plan.blogs) {
    if (b.status !== "write") continue;
    if (!isPublicPath(b.publicPath)) continue;
    const asset = pathToAsset.get(b.publicPath);
    if (!asset) throw new Error(`Missing asset for blog ${b.blogId}`);
    const { error } = await admin
      .from("blog_posts")
      .update({ image_url: asset.hosted_url, media_asset_id: asset.id })
      .eq("id", b.blogId);
    if (error) throw new Error(error.message);
    blogsWritten++;
  }

  return {
    plan,
    ingested,
    reused,
    landingWritten,
    blogsWritten,
    pathToAsset,
  };
}

export function formatPlanReport(plan: PublicMigrationPlan): string {
  const lines: string[] = [];
  lines.push(`assets_ingest: ${plan.assets.filter((a) => a.status === "ingest").length}`);
  lines.push(`assets_reuse: ${plan.assets.filter((a) => a.status === "reuse").length}`);
  lines.push(`landing_write: ${plan.landing.filter((l) => l.status === "write").length}`);
  lines.push(
    `landing_already: ${plan.landing.filter((l) => l.status === "already_hosted").length}`,
  );
  lines.push(`blogs_write: ${plan.blogs.filter((b) => b.status === "write").length}`);
  lines.push(
    `blogs_already: ${plan.blogs.filter((b) => b.status === "already_hosted").length}`,
  );
  lines.push(`deferred: ${plan.deferred.length}`);
  for (const a of plan.assets) {
    lines.push(`  asset ${a.status}: ${a.publicPath}${a.assetId ? ` → ${a.assetId}` : ""}`);
  }
  for (const l of plan.landing) {
    lines.push(`  landing ${l.status}: ${l.slotKey} ← ${l.publicPath}`);
  }
  for (const b of plan.blogs.filter((x) => x.status === "write").slice(0, 20)) {
    lines.push(`  blog write: ${b.slug ?? b.blogId} ← ${b.publicPath}`);
  }
  const extraBlogs = plan.blogs.filter((x) => x.status === "write").length - 20;
  if (extraBlogs > 0) lines.push(`  blog write: … +${extraBlogs} more`);
  for (const d of plan.deferred.slice(0, 5)) {
    lines.push(`  deferred: ${d.publicPath} (${d.reason})`);
  }
  if (plan.deferred.length > 5) {
    lines.push(`  deferred: … +${plan.deferred.length - 5} more`);
  }
  return lines.join("\n");
}
