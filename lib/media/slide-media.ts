import type { ImageMediaConfig } from "@/lib/product-slide-sections/types";
import resolved from "@/lib/media/slide-media-resolved.json";

export type SlideMediaResolved = {
  src: string;
  assetId: string;
};

// ponytail: local copy — importing migrate-public pulls sharp into the client bundle
function normalizePublicPath(publicPath: string): string {
  const p = publicPath.trim();
  if (!p.startsWith("/")) return `/${p}`;
  return p;
}

export const SLIDE_PUBLIC_PATHS: Array<{ publicPath: string; consumer: string }> = [
  { publicPath: "/images/landing/ambassadors-1.jpg", consumer: "ambassadors" },
  { publicPath: "/images/landing/ambassadors-2.png", consumer: "ambassadors" },
  { publicPath: "/images/landing/ambassadors-3.png", consumer: "ambassadors" },
  { publicPath: "/m-pillow-317460-final---H-WEB.webp", consumer: "premium" },
  { publicPath: "/m-pillow-317409-final---H-WEB.webp", consumer: "premium" },
  { publicPath: "/NeckDepth.webp", consumer: "premium" },
  { publicPath: "/3_compartment.webp", consumer: "premium" },
  { publicPath: "/m-pillow-518057-final-V-WEB.webp", consumer: "premium" },
  { publicPath: "/wash-care.webp", consumer: "basic/premium/mbolster" },
  { publicPath: "/fillings.webp", consumer: "premium/mbolster" },
  { publicPath: "/shoulderlength_800x.webp", consumer: "premium" },
  { publicPath: "/NeckDepth_800x.webp", consumer: "premium" },
  { publicPath: "/HeadDepth_800x.webp", consumer: "premium" },
  { publicPath: "/necklength_800x.webp", consumer: "premium" },
  { publicPath: "/m-pillow-417804-final-WEB.webp", consumer: "premium" },
  { publicPath: "/DSC03705.webp", consumer: "premium" },
  { publicPath: "/m-pillow-518001-final-WEB.webp", consumer: "basic" },
  { publicPath: "/Square_3waysleep.webp", consumer: "basic" },
  { publicPath: "/001.webp", consumer: "basic" },
  { publicPath: "/sizecomparison.webp", consumer: "basic" },
  { publicPath: "/MpillowIGPostMay2025.zip-2.webp", consumer: "mbolster" },
  { publicPath: "/MpillowIGPostMay2025.zip-5.webp", consumer: "mbolster" },
  { publicPath: "/Mpillow_IG_Post_May_2025.webp", consumer: "mbolster" },
  { publicPath: "/IMG_5097.jpg", consumer: "mbolster" },
  { publicPath: "/IMG_5110.webp", consumer: "mbolster" },
  { publicPath: "/bolster_mbolster_size.webp", consumer: "mbolster" },
  { publicPath: "/Bolster_Fillings_gif.webp", consumer: "mbolster" },
  { publicPath: "/bev-back-sleep.png", consumer: "cervical" },
  { publicPath: "/cns-pouch.png", consumer: "cervical" },
  { publicPath: "/round-flat-head-comp.png", consumer: "cervical" },
  { publicPath: "/cns-insert.png", consumer: "cervical" },
  { publicPath: "/cns-contact-point.png", consumer: "cervical" },
  { publicPath: "/m-pillow-417953-web.webp", consumer: "premium+landing" },
  { publicPath: "/mpillow-cervical-neck.webp", consumer: "premium+landing" },
  { publicPath: "/basic-mpillow.webp", consumer: "basic+landing" },
  { publicPath: "/808907f4-ac2b-499a-ace6-69933883b2f5.webp", consumer: "mbolster+landing" },
];

export type SlideMediaMap = Record<string, SlideMediaResolved>;

export function getSlideMediaMap(): SlideMediaMap {
  return resolved as SlideMediaMap;
}

export function resolveSlideMedia(publicPath: string): SlideMediaResolved | null {
  const path = normalizePublicPath(publicPath);
  const hit = getSlideMediaMap()[path];
  if (!hit?.src || !hit?.assetId) return null;
  return hit;
}

// ponytail: map is commit-time; live replace needs site_settings (ADR 0004).
export function slideImage(
  publicPath: string,
  props: Omit<ImageMediaConfig, "src" | "assetId">,
): ImageMediaConfig {
  const path = normalizePublicPath(publicPath);
  const hit = resolveSlideMedia(path);
  return {
    ...props,
    src: hit?.src ?? path,
    assetId: hit?.assetId,
  };
}

export type PlannedSlideAsset = {
  publicPath: string;
  consumer: string;
  status: "ingest" | "reuse" | "already_resolved";
  assetId?: string;
  hostedUrl?: string;
};

export type SlideMigrationPlan = {
  assets: PlannedSlideAsset[];
};

export function planSlideMigration(input: {
  paths?: Array<{ publicPath: string; consumer: string }>;
  existingByTag: Map<string, { id: string; hosted_url: string; tags: string[] }>;
  resolved?: SlideMediaMap;
}): SlideMigrationPlan {
  const paths = input.paths ?? SLIDE_PUBLIC_PATHS;
  const resolved = input.resolved ?? {};
  const assets: PlannedSlideAsset[] = [];

  for (const { publicPath, consumer } of paths) {
    const path = normalizePublicPath(publicPath);
    const current = resolved[path];
    if (current?.src && current?.assetId && /^https?:\/\//i.test(current.src)) {
      assets.push({
        publicPath: path,
        consumer,
        status: "already_resolved",
        assetId: current.assetId,
        hostedUrl: current.src,
      });
      continue;
    }

    const tag = `public:${path.toLowerCase()}`;
    const existing = input.existingByTag.get(tag);
    if (existing?.hosted_url) {
      assets.push({
        publicPath: path,
        consumer,
        status: "reuse",
        assetId: existing.id,
        hostedUrl: existing.hosted_url,
      });
    } else {
      assets.push({ publicPath: path, consumer, status: "ingest" });
    }
  }

  return { assets };
}
