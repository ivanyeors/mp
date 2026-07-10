/**
 * Usage resolver (slice 10): where a Media Asset is attached.
 * Matches hosted_url and media_asset_id. Does not scan order_items.
 */

export type ImageUsageEntry = {
  type:
    | "blog_featured"
    | "blog_inline"
    | "landing_slot"
    | "landing_section"
    | "product_image"
    | "product_variant"
    | "category"
    | "partner"
    | "partners_page";
  label: string;
  ref_id: string;
};

export type AssetRef = { id: string; hosted_url: string | null };

export type UsageConsumerRows = {
  blogs?: Array<{
    id: string;
    slug: string;
    image_url: string | null;
    content: unknown;
    media_asset_id?: string | null;
  }>;
  settings?: Array<{ key: string; value: string }>;
  landingSections?: Array<{ id: string; slug: string; content: unknown }>;
  productImages?: Array<{
    id: string;
    product_id: string;
    url: string;
    media_asset_id?: string | null;
  }>;
  variants?: Array<{
    id: string;
    product_id: string;
    image_url: string | null;
    media_asset_id?: string | null;
  }>;
  categories?: Array<{
    id: string;
    slug: string;
    image_url: string | null;
    media_asset_id?: string | null;
  }>;
  partners?: Array<{
    id: string;
    name: string;
    logo_url: string | null;
    media_asset_id?: string | null;
  }>;
  partnersPages?: Array<{ id: string; content: unknown }>;
  /** Intentionally unused — order snapshots must never count as usage. */
  orderItems?: Array<{ id: string; image_url: string | null }>;
};

const SLOT_LABELS: Record<string, string> = {
  landing_hero: "Hero",
  landing_size_matters: "Size Matters",
  landing_marquee: "Marquee",
  landing_ambassadors: "Ambassadors",
  landing_cervical_neck: "Cervical Neck",
  landing_basic_pillow: "Basic Pillow",
  landing_premium_pillow: "Premium Pillow",
  landing_mbolster: "Mbolster",
  landing_founder: "Founder",
};

function getBlogTitle(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  for (const loc of Object.values(content as Record<string, { title?: string }>)) {
    if (loc?.title) return loc.title;
  }
  return "";
}

function refsMatch(
  asset: AssetRef,
  opts: { url?: string | null; assetId?: string | null },
): boolean {
  if (opts.assetId && opts.assetId === asset.id) return true;
  if (asset.hosted_url && opts.url && opts.url === asset.hosted_url) return true;
  return false;
}

/** Deep-walk JSON for exact URL string or media_asset_id field. */
export function jsonRefsAsset(value: unknown, asset: AssetRef): boolean {
  if (value == null) return false;
  if (typeof value === "string") {
    if (asset.hosted_url && value === asset.hosted_url) return true;
    if (value === asset.id) return true;
    if (asset.hosted_url && value.includes(asset.hosted_url)) return true;
    return false;
  }
  if (Array.isArray(value)) return value.some((v) => jsonRefsAsset(v, asset));
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.media_asset_id === "string" && obj.media_asset_id === asset.id) {
      return true;
    }
    return Object.values(obj).some((v) => jsonRefsAsset(v, asset));
  }
  return false;
}

function entryKey(e: ImageUsageEntry): string {
  return `${e.type}:${e.ref_id}`;
}

function dedupe(entries: ImageUsageEntry[]): ImageUsageEntry[] {
  const seen = new Set<string>();
  const out: ImageUsageEntry[] = [];
  for (const e of entries) {
    const k = entryKey(e);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}

/**
 * Pure resolver against fixture/consumer rows.
 * orderItems in rows are ignored on purpose (AC: exclude order snapshots).
 */
export function resolveUsages(
  asset: AssetRef,
  rows: UsageConsumerRows,
): ImageUsageEntry[] {
  const usages: ImageUsageEntry[] = [];
  void rows.orderItems; // ponytail: explicit non-scan so tests can assert exclusion

  for (const blog of rows.blogs ?? []) {
    const label = getBlogTitle(blog.content) || blog.slug;
    if (refsMatch(asset, { url: blog.image_url, assetId: blog.media_asset_id })) {
      usages.push({ type: "blog_featured", label, ref_id: blog.id });
    }
    // Inline: body/content refs only (not the featured image_url field alone)
    const content = blog.content as Record<string, { body?: string }> | null;
    let inline = false;
    if (content) {
      for (const locale of Object.values(content)) {
        const body = locale?.body ?? "";
        if (asset.hosted_url && body.includes(asset.hosted_url)) {
          inline = true;
          break;
        }
        if (body.includes(asset.id)) {
          inline = true;
          break;
        }
      }
    }
    if (!inline && jsonRefsAsset(blog.content, asset) && !refsMatch(asset, { url: blog.image_url, assetId: blog.media_asset_id })) {
      inline = true;
    }
    if (inline) {
      usages.push({ type: "blog_inline", label, ref_id: blog.id });
    }
  }

  for (const setting of rows.settings ?? []) {
    if (!setting.key.startsWith("landing_")) continue;
    if (
      refsMatch(asset, { url: setting.value }) ||
      setting.value === asset.id ||
      (asset.hosted_url && setting.value.includes(asset.hosted_url))
    ) {
      usages.push({
        type: "landing_slot",
        label: SLOT_LABELS[setting.key] ?? setting.key,
        ref_id: setting.key,
      });
    }
  }

  for (const section of rows.landingSections ?? []) {
    if (jsonRefsAsset(section.content, asset)) {
      usages.push({
        type: "landing_section",
        label: section.slug,
        ref_id: section.id,
      });
    }
  }

  for (const img of rows.productImages ?? []) {
    if (refsMatch(asset, { url: img.url, assetId: img.media_asset_id })) {
      usages.push({
        type: "product_image",
        label: `Product ${img.product_id.slice(0, 8)}`,
        ref_id: img.id,
      });
    }
  }

  for (const v of rows.variants ?? []) {
    if (refsMatch(asset, { url: v.image_url, assetId: v.media_asset_id })) {
      usages.push({
        type: "product_variant",
        label: `Variant ${v.id.slice(0, 8)}`,
        ref_id: v.id,
      });
    }
  }

  for (const c of rows.categories ?? []) {
    if (refsMatch(asset, { url: c.image_url, assetId: c.media_asset_id })) {
      usages.push({
        type: "category",
        label: c.slug,
        ref_id: c.id,
      });
    }
  }

  for (const p of rows.partners ?? []) {
    if (refsMatch(asset, { url: p.logo_url, assetId: p.media_asset_id })) {
      usages.push({
        type: "partner",
        label: p.name,
        ref_id: p.id,
      });
    }
  }

  for (const page of rows.partnersPages ?? []) {
    if (jsonRefsAsset(page.content, asset)) {
      usages.push({
        type: "partners_page",
        label: "Partners page",
        ref_id: page.id,
      });
    }
  }

  return dedupe(usages);
}

/** Index usages by hosted URL and by asset id (for library grid). */
// ponytail: O(assets×rows) scan; invert to URL/id maps if library grows past ~1k
export function indexUsages(
  assets: AssetRef[],
  rows: UsageConsumerRows,
): { byUrl: Record<string, ImageUsageEntry[]>; byAssetId: Record<string, ImageUsageEntry[]> } {
  const byUrl: Record<string, ImageUsageEntry[]> = {};
  const byAssetId: Record<string, ImageUsageEntry[]> = {};
  for (const asset of assets) {
    const list = resolveUsages(asset, rows);
    if (list.length === 0) continue;
    byAssetId[asset.id] = list;
    if (asset.hosted_url) byUrl[asset.hosted_url] = list;
  }
  return { byUrl, byAssetId };
}

async function fetchConsumerRows(): Promise<UsageConsumerRows> {
  const { supabaseAdmin } = await import("@/lib/supabase/server");
  const admin = supabaseAdmin();

  const [
    blogs,
    settings,
    landingSections,
    productImages,
    variants,
    categories,
    partners,
    partnersPages,
  ] = await Promise.all([
    admin.from("blog_posts").select("id, slug, image_url, content"),
    admin.from("site_settings").select("key, value").like("key", "landing_%"),
    admin.from("landing_sections").select("id, slug, content"),
    admin.from("product_images").select("id, product_id, url, media_asset_id"),
    admin.from("product_variants").select("id, product_id, image_url"),
    admin.from("categories").select("id, slug, image_url"),
    admin.from("partners").select("id, name, logo_url"),
    admin.from("partners_page").select("id, content"),
  ]);

  return {
    blogs: (blogs.data ?? []) as UsageConsumerRows["blogs"],
    settings: (settings.data ?? []) as UsageConsumerRows["settings"],
    landingSections: (landingSections.data ?? []) as UsageConsumerRows["landingSections"],
    productImages: (productImages.data ?? []) as UsageConsumerRows["productImages"],
    variants: (variants.data ?? []) as UsageConsumerRows["variants"],
    categories: (categories.data ?? []) as UsageConsumerRows["categories"],
    partners: (partners.data ?? []) as UsageConsumerRows["partners"],
    partnersPages: (partnersPages.data ?? []) as UsageConsumerRows["partnersPages"],
  };
}

/** Where a hosted image URL is attached (legacy + expanded scanners). */
export async function listImageUsages(url: string): Promise<ImageUsageEntry[]> {
  return listAssetUsages({ id: "", hosted_url: url });
}

/** Full Asset usage (URL + id matching). */
export async function listAssetUsages(asset: AssetRef): Promise<ImageUsageEntry[]> {
  const rows = await fetchConsumerRows();
  return resolveUsages(asset, rows);
}

/** URL → usages map for Media library grid (all Assets with hosted_url). */
export async function buildUsageMap(
  assets: AssetRef[],
): Promise<Record<string, ImageUsageEntry[]>> {
  const rows = await fetchConsumerRows();
  return indexUsages(assets, rows).byUrl;
}
