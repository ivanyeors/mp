/**
 * Apply helpers for slide/ambassadors `/public` → Media Asset migration (slice 17).
 */

import fs from "fs/promises";
import path from "path";
import {
  indexAssetsByPublicTag,
  publicPathTag,
  type ExistingPublicAsset,
} from "@/lib/media/migrate-public";
import { repoPublicFilePath } from "@/lib/media/migrate-public-apply";
import {
  planSlideMigration,
  SLIDE_PUBLIC_PATHS,
  type SlideMediaMap,
  type SlideMigrationPlan,
} from "@/lib/media/slide-media";
import { listMediaAssets, updateMediaAsset } from "@/lib/media-assets";
import { ingestImageAsset } from "@/lib/media-assets/ingest";

export type ApplySlideMigrationResult = {
  plan: SlideMigrationPlan;
  ingested: number;
  reused: number;
  written: number;
  map: SlideMediaMap;
};

async function ensureAssetForPath(
  publicPath: string,
  cache: Map<string, { id: string; hosted_url: string }>,
  existingByTag: Map<string, ExistingPublicAsset>,
): Promise<{ id: string; hosted_url: string; ingested: boolean }> {
  const cached = cache.get(publicPath);
  if (cached) return { ...cached, ingested: false };

  const tag = publicPathTag(publicPath);
  const existing = existingByTag.get(tag);
  if (existing) {
    cache.set(publicPath, { id: existing.id, hosted_url: existing.hosted_url });
    return { id: existing.id, hosted_url: existing.hosted_url, ingested: false };
  }

  const filePath = repoPublicFilePath(publicPath);
  const bytes = await fs.readFile(filePath);
  const { asset } = await ingestImageAsset({
    bytes,
    originalName: path.basename(publicPath),
    imported_at: new Date().toISOString(),
  });
  const tagged = await updateMediaAsset(asset.id, {
    tags: [...(asset.tags ?? []), tag],
  });
  const hosted = tagged.hosted_url ?? asset.hosted_url;
  if (!hosted) throw new Error(`Ingested asset missing hosted_url for ${publicPath}`);

  const ref = { id: tagged.id, hosted_url: hosted };
  cache.set(publicPath, ref);
  existingByTag.set(tag, { ...ref, tags: tagged.tags });
  return { ...ref, ingested: true };
}

export function resolvedMapPath(cwd = process.cwd()): string {
  return path.join(cwd, "lib/media/slide-media-resolved.json");
}

export async function readSlideMediaMapFromDisk(cwd = process.cwd()): Promise<SlideMediaMap> {
  try {
    const raw = await fs.readFile(resolvedMapPath(cwd), "utf8");
    const parsed = JSON.parse(raw) as SlideMediaMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeSlideMediaMap(map: SlideMediaMap, cwd = process.cwd()): Promise<void> {
  const sorted: SlideMediaMap = {};
  for (const key of Object.keys(map).sort()) {
    sorted[key] = map[key]!;
  }
  await fs.writeFile(resolvedMapPath(cwd), `${JSON.stringify(sorted, null, 2)}\n`, "utf8");
}

export async function loadSlideMigrationContext(): Promise<{
  plan: SlideMigrationPlan;
  existingByTag: Map<string, ExistingPublicAsset>;
  diskMap: SlideMediaMap;
}> {
  const [assets, diskMap] = await Promise.all([
    listMediaAssets({ limit: 5000 }),
    readSlideMediaMapFromDisk(),
  ]);
  const existingByTag = indexAssetsByPublicTag(assets);
  const plan = planSlideMigration({
    existingByTag,
    resolved: diskMap,
  });
  return { plan, existingByTag, diskMap };
}

/** Dry-run = plan only. Apply = ingest/reuse + write resolved JSON map. */
export async function applySlideMigration(opts?: {
  dryRun?: boolean;
}): Promise<ApplySlideMigrationResult> {
  const dryRun = opts?.dryRun ?? false;
  const { plan, existingByTag, diskMap } = await loadSlideMigrationContext();
  const map: SlideMediaMap = { ...diskMap };
  const cache = new Map<string, { id: string; hosted_url: string }>();

  if (dryRun) {
    return {
      plan,
      ingested: plan.assets.filter((a) => a.status === "ingest").length,
      reused: plan.assets.filter((a) => a.status === "reuse").length,
      written: 0,
      map,
    };
  }

  let ingested = 0;
  let reused = 0;
  let written = 0;

  for (const a of plan.assets) {
    if (a.status === "already_resolved" && a.assetId && a.hostedUrl) {
      map[a.publicPath] = { src: a.hostedUrl, assetId: a.assetId };
      continue;
    }
    const result = await ensureAssetForPath(a.publicPath, cache, existingByTag);
    if (result.ingested) ingested++;
    else reused++;
    const prev = diskMap[a.publicPath];
    map[a.publicPath] = { src: result.hosted_url, assetId: result.id };
    if (prev?.src !== result.hosted_url || prev?.assetId !== result.id) {
      written++;
    }
  }

  await writeSlideMediaMap(map);
  return { plan, ingested, reused, written, map };
}

export function formatSlidePlanReport(plan: SlideMigrationPlan): string {
  const lines: string[] = [];
  lines.push(`slide_paths: ${SLIDE_PUBLIC_PATHS.length}`);
  lines.push(`ingest: ${plan.assets.filter((a) => a.status === "ingest").length}`);
  lines.push(`reuse: ${plan.assets.filter((a) => a.status === "reuse").length}`);
  lines.push(
    `already_resolved: ${plan.assets.filter((a) => a.status === "already_resolved").length}`,
  );
  for (const a of plan.assets) {
    lines.push(
      `  ${a.status}: ${a.publicPath} (${a.consumer})${a.assetId ? ` → ${a.assetId}` : ""}`,
    );
  }
  return lines.join("\n");
}
