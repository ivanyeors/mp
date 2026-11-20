import { landingAssetIdKey } from "@/lib/media/replace";

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

export const DEFERRED_PUBLIC_PATHS: Array<{ publicPath: string; reason: string }> = [];

export function publicPathTag(publicPath: string): string {
  return `public:${normalizePublicPath(publicPath).toLowerCase()}`;
}

export function normalizePublicPath(publicPath: string): string {
  const p = publicPath.trim();
  if (!p.startsWith("/")) return `/${p}`;
  return p;
}

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
