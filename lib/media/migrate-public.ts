/**
 * Slice 16 — migrate known `/public` marketing images into Media Assets.
 *
 * Landing: write site_settings URL + companion `*_asset_id` (slice 15 dual-write).
 * Blogs: rewrite featured `image_url` (+ `media_asset_id`).
 * Slide configs / ambassadors gallery: inventoried but deferred to slice 17.
 *
 * Idempotency: Assets tagged `public:<lowercase-path>`; re-run reuses them.
 */

import { landingAssetIdKey } from "@/lib/media/replace";

/** Landing slot defaults — keep in sync with `app/[lang]/page.tsx` IMAGE_DEFAULTS. */
export const LANDING_PUBLIC_DEFAULTS: Array<{ slotKey: string; publicPath: string }> = [
  { slotKey: "landing_hero", publicPath: "/m-pillow-417953-web.webp" },
  { slotKey: "landing_size_matters", publicPath: "/images/landing/size-matters.jpg" },
  { slotKey: "landing_marquee", publicPath: "/3way-side-sleep.jpg" },
  { slotKey: "landing_ambassadors", publicPath: "/images/landing/ambassadors-hero.webp" },
  { slotKey: "landing_cervical_neck", publicPath: "/mpillow-cervical-neck.webp" },
  { slotKey: "landing_basic_pillow", publicPath: "/basic-mpillow.webp" },
  { slotKey: "landing_premium_pillow", publicPath: "/DarkMpillowImage-WEB.jpg" },
  { slotKey: "landing_mbolster", publicPath: "/808907f4-ac2b-499a-ace6-69933883b2f5.webp" },
  { slotKey: "landing_founder", publicPath: "/Darrenyeo-profileshoot_2.webp" },
];

/**
 * Paths still hard-coded in slide configs / ambassadors slide-in.
 * Intentionally left static until slice 17.
 */
export const DEFERRED_PUBLIC_PATHS: Array<{ publicPath: string; reason: string }> = [
  { publicPath: "/images/landing/ambassadors-1.jpg", reason: "ambassadors slide-in (slice 17)" },
  { publicPath: "/images/landing/ambassadors-2.png", reason: "ambassadors slide-in (slice 17)" },
  { publicPath: "/images/landing/ambassadors-3.png", reason: "ambassadors slide-in (slice 17)" },
  { publicPath: "/m-pillow-317460-final---H-WEB.webp", reason: "premium slide config (slice 17)" },
  { publicPath: "/m-pillow-317409-final---H-WEB.webp", reason: "premium slide config (slice 17)" },
  { publicPath: "/NeckDepth.webp", reason: "premium slide config (slice 17)" },
  { publicPath: "/3_compartment.webp", reason: "premium slide config (slice 17)" },
  { publicPath: "/m-pillow-518057-final-V-WEB.webp", reason: "premium slide config (slice 17)" },
  { publicPath: "/wash-care.webp", reason: "slide configs (slice 17)" },
  { publicPath: "/fillings.webp", reason: "slide configs (slice 17)" },
  { publicPath: "/shoulderlength_800x.webp", reason: "premium slide config (slice 17)" },
  { publicPath: "/NeckDepth_800x.webp", reason: "premium slide config (slice 17)" },
  { publicPath: "/HeadDepth_800x.webp", reason: "premium slide config (slice 17)" },
  { publicPath: "/necklength_800x.webp", reason: "premium slide config (slice 17)" },
  { publicPath: "/m-pillow-417804-final-WEB.webp", reason: "premium slide config (slice 17)" },
  { publicPath: "/DSC03705.webp", reason: "premium slide config (slice 17)" },
  { publicPath: "/m-pillow-518001-final-WEB.webp", reason: "basic slide config (slice 17)" },
  { publicPath: "/Square_3waysleep.webp", reason: "basic slide config (slice 17)" },
  { publicPath: "/001.webp", reason: "basic slide config (slice 17)" },
  { publicPath: "/sizecomparison.webp", reason: "basic slide config (slice 17)" },
  { publicPath: "/MpillowIGPostMay2025.zip-2.webp", reason: "mbolster slide config (slice 17)" },
  { publicPath: "/MpillowIGPostMay2025.zip-5.webp", reason: "mbolster slide config (slice 17)" },
  { publicPath: "/Mpillow_IG_Post_May_2025.webp", reason: "mbolster slide config (slice 17)" },
  { publicPath: "/IMG_5097.jpg", reason: "mbolster slide config (slice 17)" },
  { publicPath: "/IMG_5110.webp", reason: "mbolster slide config (slice 17)" },
  { publicPath: "/bolster_mbolster_size.webp", reason: "mbolster slide config (slice 17)" },
  { publicPath: "/Bolster_Fillings_gif.webp", reason: "mbolster slide config (slice 17)" },
  { publicPath: "/bev-back-sleep.png", reason: "cervical slide config (slice 17)" },
  { publicPath: "/cns-pouch.png", reason: "cervical slide config (slice 17)" },
  { publicPath: "/round-flat-head-comp.png", reason: "cervical slide config (slice 17)" },
  { publicPath: "/cns-insert.png", reason: "cervical slide config (slice 17)" },
  { publicPath: "/cns-contact-point.png", reason: "cervical slide config (slice 17)" },
];

/** Tag used for idempotent lookup (`public:/path`, lowercased). */
export function publicPathTag(publicPath: string): string {
  return `public:${normalizePublicPath(publicPath).toLowerCase()}`;
}

/** Ensure leading `/`; preserve case for case-sensitive filesystems. */
export function normalizePublicPath(publicPath: string): string {
  const p = publicPath.trim();
  if (!p.startsWith("/")) return `/${p}`;
  return p;
}

/** Relative site path like `/images/foo.jpg` (not protocol-relative). */
export function isPublicPath(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.startsWith("/") && !url.startsWith("//");
}

export function isHostedUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /^https?:\/\//i.test(url);
}

export type ExistingPublicAsset = {
  id: string;
  hosted_url: string;
  tags: string[];
};

export type PlannedAsset = {
  publicPath: string;
  status: "ingest" | "reuse";
  assetId?: string;
  hostedUrl?: string;
};

export type PlannedLandingWrite = {
  slotKey: string;
  publicPath: string;
  status: "write" | "already_hosted";
  currentUrl?: string | null;
  currentAssetId?: string | null;
};

export type PlannedBlogWrite = {
  blogId: string;
  slug?: string;
  publicPath: string;
  status: "write" | "already_hosted";
};

export type PublicMigrationPlan = {
  assets: PlannedAsset[];
  landing: PlannedLandingWrite[];
  blogs: PlannedBlogWrite[];
  deferred: Array<{ publicPath: string; reason: string }>;
};

/**
 * Pure plan: which Assets to ingest/reuse and which consumers to rewrite.
 * `existingByTag` maps `public:/path` → asset.
 */
export function planPublicMigration(input: {
  landingDefaults?: Array<{ slotKey: string; publicPath: string }>;
  settings?: Array<{ key: string; value: string }>;
  blogs?: Array<{
    id: string;
    slug?: string;
    image_url: string | null;
    media_asset_id?: string | null;
  }>;
  existingByTag: Map<string, ExistingPublicAsset>;
  deferred?: Array<{ publicPath: string; reason: string }>;
}): PublicMigrationPlan {
  const landingDefaults = input.landingDefaults ?? LANDING_PUBLIC_DEFAULTS;
  const settingsByKey = new Map((input.settings ?? []).map((s) => [s.key, s.value]));
  const deferred = input.deferred ?? DEFERRED_PUBLIC_PATHS;

  const neededPaths = new Set<string>();
  const landing: PlannedLandingWrite[] = [];

  for (const { slotKey, publicPath } of landingDefaults) {
    const currentUrl = settingsByKey.get(slotKey) ?? null;
    const currentAssetId = settingsByKey.get(landingAssetIdKey(slotKey)) ?? null;
    const path = normalizePublicPath(publicPath);

    if (isHostedUrl(currentUrl) && currentAssetId) {
      landing.push({
        slotKey,
        publicPath: path,
        status: "already_hosted",
        currentUrl,
        currentAssetId,
      });
      continue;
    }

    // Prefer explicit public override if present; else default path.
    const sourcePath =
      currentUrl && isPublicPath(currentUrl) ? normalizePublicPath(currentUrl) : path;
    neededPaths.add(sourcePath);
    landing.push({
      slotKey,
      publicPath: sourcePath,
      status: "write",
      currentUrl,
      currentAssetId,
    });
  }

  const blogs: PlannedBlogWrite[] = [];
  for (const blog of input.blogs ?? []) {
    if (!blog.image_url) continue;
    if (isHostedUrl(blog.image_url) && blog.media_asset_id) {
      blogs.push({
        blogId: blog.id,
        slug: blog.slug,
        publicPath: blog.image_url,
        status: "already_hosted",
      });
      continue;
    }
    if (!isPublicPath(blog.image_url)) continue;
    const path = normalizePublicPath(blog.image_url);
    neededPaths.add(path);
    blogs.push({
      blogId: blog.id,
      slug: blog.slug,
      publicPath: path,
      status: "write",
    });
  }

  const assets: PlannedAsset[] = [];
  for (const publicPath of [...neededPaths].sort()) {
    const tag = publicPathTag(publicPath);
    const existing = input.existingByTag.get(tag);
    if (existing?.hosted_url) {
      assets.push({
        publicPath,
        status: "reuse",
        assetId: existing.id,
        hostedUrl: existing.hosted_url,
      });
    } else {
      assets.push({ publicPath, status: "ingest" });
    }
  }

  return { assets, landing, blogs, deferred };
}

/** Index Assets that carry a `public:` tag. */
export function indexAssetsByPublicTag(
  assets: Array<{ id: string; hosted_url: string | null; tags?: string[] | null }>,
): Map<string, ExistingPublicAsset> {
  const map = new Map<string, ExistingPublicAsset>();
  for (const a of assets) {
    if (!a.hosted_url) continue;
    for (const tag of a.tags ?? []) {
      if (!tag.startsWith("public:")) continue;
      map.set(tag, {
        id: a.id,
        hosted_url: a.hosted_url,
        tags: a.tags ?? [],
      });
    }
  }
  return map;
}
