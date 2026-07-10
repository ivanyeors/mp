/**
 * Replace-everywhere (slice 15): swap hosted_url (+ optional Asset id) across
 * known consumers. Order item snapshots are never touched.
 *
 * Landing dual-write: slot URL stays at `landing_*`; Asset id at `landing_*_asset_id`.
 */

export const LANDING_ASSET_ID_SUFFIX = "_asset_id";

export function landingAssetIdKey(slotKey: string): string {
  return `${slotKey}${LANDING_ASSET_ID_SUFFIX}`;
}

export function isLandingAssetIdKey(key: string): boolean {
  return key.startsWith("landing_") && key.endsWith(LANDING_ASSET_ID_SUFFIX);
}

export function landingSlotKeyFromAssetIdKey(key: string): string {
  return key.slice(0, -LANDING_ASSET_ID_SUFFIX.length);
}

export type ReplaceInput = {
  oldUrl: string;
  newUrl: string;
  oldAssetId?: string | null;
  newAssetId?: string | null;
};

export type ReplaceSummary = {
  blogFeatured: number;
  blogInline: number;
  landingSlots: string[];
  landingSections: number;
  productImages: number;
  productVariants: number;
  categories: number;
  partners: number;
  partnersPages: number;
};

export function emptyReplaceSummary(): ReplaceSummary {
  return {
    blogFeatured: 0,
    blogInline: 0,
    landingSlots: [],
    landingSections: 0,
    productImages: 0,
    productVariants: 0,
    categories: 0,
    partners: 0,
    partnersPages: 0,
  };
}

/** Deep-replace URL strings and media_asset_id fields. */
export function replaceJsonRefs(
  value: unknown,
  input: ReplaceInput,
): { value: unknown; changed: boolean } {
  const { oldUrl, newUrl, oldAssetId, newAssetId } = input;

  if (value == null) return { value, changed: false };

  if (typeof value === "string") {
    let next = value;
    let changed = false;
    if (oldUrl && next.includes(oldUrl)) {
      next = next.replaceAll(oldUrl, newUrl);
      changed = true;
    }
    if (oldAssetId && newAssetId && next === oldAssetId) {
      next = newAssetId;
      changed = true;
    }
    return { value: next, changed };
  }

  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const r = replaceJsonRefs(item, input);
      if (r.changed) changed = true;
      return r.value;
    });
    return { value: next, changed };
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (
        k === "media_asset_id" &&
        typeof v === "string" &&
        oldAssetId &&
        newAssetId &&
        v === oldAssetId
      ) {
        next[k] = newAssetId;
        changed = true;
        continue;
      }
      const r = replaceJsonRefs(v, input);
      if (r.changed) changed = true;
      next[k] = r.value;
    }
    return { value: next, changed };
  }

  return { value, changed: false };
}

export type ReplacePlanRows = {
  blogs?: Array<{
    id: string;
    image_url: string | null;
    content: unknown;
    media_asset_id?: string | null;
  }>;
  settings?: Array<{ key: string; value: string }>;
  landingSections?: Array<{ id: string; content: unknown }>;
  productImages?: Array<{
    id: string;
    url: string;
    media_asset_id?: string | null;
  }>;
  variants?: Array<{
    id: string;
    image_url: string | null;
    media_asset_id?: string | null;
  }>;
  categories?: Array<{
    id: string;
    image_url: string | null;
    media_asset_id?: string | null;
  }>;
  partners?: Array<{
    id: string;
    logo_url: string | null;
    media_asset_id?: string | null;
  }>;
  partnersPages?: Array<{ id: string; content: unknown }>;
  /** Must remain unchanged — snapshots are historical. */
  orderItems?: Array<{ id: string; image_url: string | null }>;
};

function swapUrl(url: string | null | undefined, input: ReplaceInput): string | null | undefined {
  if (url == null) return url;
  if (!url.includes(input.oldUrl)) return url;
  return url.replaceAll(input.oldUrl, input.newUrl);
}

function swapAssetId(
  id: string | null | undefined,
  input: ReplaceInput,
): string | null | undefined {
  if (id == null) return id;
  if (!input.oldAssetId || !input.newAssetId) return id;
  return id === input.oldAssetId ? input.newAssetId : id;
}

/**
 * Pure planner: returns updated consumer rows + summary.
 * orderItems are copied through unchanged (never scanned for replace).
 */
export function planReplaceEverywhere(
  rows: ReplacePlanRows,
  input: ReplaceInput,
): { rows: ReplacePlanRows; summary: ReplaceSummary } {
  const summary = emptyReplaceSummary();
  const out: ReplacePlanRows = {
    orderItems: rows.orderItems ? rows.orderItems.map((o) => ({ ...o })) : undefined,
  };

  if (rows.blogs) {
    out.blogs = rows.blogs.map((blog) => {
      let image_url = blog.image_url;
      let media_asset_id = blog.media_asset_id;
      let content = blog.content;
      let featured = false;
      let inline = false;

      const nextUrl = swapUrl(image_url, input);
      if (nextUrl !== image_url) {
        image_url = nextUrl ?? null;
        featured = true;
      }
      const nextId = swapAssetId(media_asset_id, input);
      if (nextId !== media_asset_id) {
        media_asset_id = nextId;
        featured = true;
      }

      const contentResult = replaceJsonRefs(content, input);
      if (contentResult.changed) {
        content = contentResult.value;
        inline = true;
      }

      if (featured) summary.blogFeatured++;
      if (inline) summary.blogInline++;

      return { ...blog, image_url, media_asset_id, content };
    });
  }

  if (rows.settings) {
    const settings = rows.settings.map((s) => ({ ...s }));
    const byKey = new Map(settings.map((s) => [s.key, s]));

    for (const s of settings) {
      if (!s.key.startsWith("landing_")) continue;

      if (isLandingAssetIdKey(s.key)) {
        if (input.oldAssetId && input.newAssetId && s.value === input.oldAssetId) {
          s.value = input.newAssetId;
          const base = landingSlotKeyFromAssetIdKey(s.key);
          if (!summary.landingSlots.includes(base)) summary.landingSlots.push(base);
        }
        continue;
      }

      if (s.value === input.oldUrl || (input.oldUrl && s.value.includes(input.oldUrl))) {
        s.value = s.value.replaceAll(input.oldUrl, input.newUrl);
        if (!summary.landingSlots.includes(s.key)) summary.landingSlots.push(s.key);

        // Dual-write companion id when we know the new Asset
        if (input.newAssetId) {
          const idKey = landingAssetIdKey(s.key);
          const existing = byKey.get(idKey);
          if (existing) {
            existing.value = input.newAssetId;
          } else {
            const row = { key: idKey, value: input.newAssetId };
            settings.push(row);
            byKey.set(idKey, row);
          }
        }
      }
    }
    out.settings = settings;
  }

  if (rows.landingSections) {
    out.landingSections = rows.landingSections.map((section) => {
      const r = replaceJsonRefs(section.content, input);
      if (r.changed) summary.landingSections++;
      return { ...section, content: r.value };
    });
  }

  if (rows.productImages) {
    out.productImages = rows.productImages.map((img) => {
      let url = img.url;
      let media_asset_id = img.media_asset_id;
      let changed = false;
      const nextUrl = swapUrl(url, input);
      if (nextUrl !== url) {
        url = nextUrl!;
        changed = true;
      }
      const nextId = swapAssetId(media_asset_id, input);
      if (nextId !== media_asset_id) {
        media_asset_id = nextId;
        changed = true;
      }
      if (changed) summary.productImages++;
      return { ...img, url, media_asset_id };
    });
  }

  if (rows.variants) {
    out.variants = rows.variants.map((v) => {
      let image_url = v.image_url;
      let media_asset_id = v.media_asset_id;
      let changed = false;
      const nextUrl = swapUrl(image_url, input);
      if (nextUrl !== image_url) {
        image_url = nextUrl ?? null;
        changed = true;
      }
      const nextId = swapAssetId(media_asset_id, input);
      if (nextId !== media_asset_id) {
        media_asset_id = nextId;
        changed = true;
      }
      if (changed) summary.productVariants++;
      return { ...v, image_url, media_asset_id };
    });
  }

  if (rows.categories) {
    out.categories = rows.categories.map((c) => {
      let image_url = c.image_url;
      let media_asset_id = c.media_asset_id;
      let changed = false;
      const nextUrl = swapUrl(image_url, input);
      if (nextUrl !== image_url) {
        image_url = nextUrl ?? null;
        changed = true;
      }
      const nextId = swapAssetId(media_asset_id, input);
      if (nextId !== media_asset_id) {
        media_asset_id = nextId;
        changed = true;
      }
      if (changed) summary.categories++;
      return { ...c, image_url, media_asset_id };
    });
  }

  if (rows.partners) {
    out.partners = rows.partners.map((p) => {
      let logo_url = p.logo_url;
      let media_asset_id = p.media_asset_id;
      let changed = false;
      const nextUrl = swapUrl(logo_url, input);
      if (nextUrl !== logo_url) {
        logo_url = nextUrl ?? null;
        changed = true;
      }
      const nextId = swapAssetId(media_asset_id, input);
      if (nextId !== media_asset_id) {
        media_asset_id = nextId;
        changed = true;
      }
      if (changed) summary.partners++;
      return { ...p, logo_url, media_asset_id };
    });
  }

  if (rows.partnersPages) {
    out.partnersPages = rows.partnersPages.map((page) => {
      const r = replaceJsonRefs(page.content, input);
      if (r.changed) summary.partnersPages++;
      return { ...page, content: r.value };
    });
  }

  return { rows: out, summary };
}

/** Load consumers, plan, persist. Never reads or writes order_items. */
export async function runReplaceEverywhere(
  input: ReplaceInput,
): Promise<ReplaceSummary> {
  const { supabaseAdmin } = await import("@/lib/supabase/server");
  const { touchLastUsed } = await import("@/lib/media-assets");
  const admin = supabaseAdmin();

  const [
    blogsRes,
    settingsRes,
    sectionsRes,
    productImagesRes,
    variantsRes,
    categoriesRes,
    partnersRes,
    partnersPagesRes,
  ] = await Promise.all([
    admin.from("blog_posts").select("id, image_url, content, media_asset_id"),
    admin.from("site_settings").select("key, value").like("key", "landing_%"),
    admin.from("landing_sections").select("id, content"),
    admin.from("product_images").select("id, url, media_asset_id"),
    admin.from("product_variants").select("id, image_url"),
    admin.from("categories").select("id, image_url, media_asset_id"),
    admin.from("partners").select("id, logo_url, media_asset_id"),
    admin.from("partners_page").select("id, content"),
  ]);

  for (const res of [
    blogsRes,
    settingsRes,
    sectionsRes,
    productImagesRes,
    variantsRes,
    categoriesRes,
    partnersRes,
    partnersPagesRes,
  ]) {
    if (res.error) throw new Error(res.error.message);
  }

  const before: ReplacePlanRows = {
    blogs: (blogsRes.data ?? []) as ReplacePlanRows["blogs"],
    settings: (settingsRes.data ?? []) as ReplacePlanRows["settings"],
    landingSections: (sectionsRes.data ?? []) as ReplacePlanRows["landingSections"],
    productImages: (productImagesRes.data ?? []) as ReplacePlanRows["productImages"],
    variants: (variantsRes.data ?? []) as ReplacePlanRows["variants"],
    categories: (categoriesRes.data ?? []) as ReplacePlanRows["categories"],
    partners: (partnersRes.data ?? []) as ReplacePlanRows["partners"],
    partnersPages: (partnersPagesRes.data ?? []) as ReplacePlanRows["partnersPages"],
  };

  const { rows, summary } = planReplaceEverywhere(before, input);
  const now = new Date().toISOString();

  for (let i = 0; i < (before.blogs?.length ?? 0); i++) {
    const prev = before.blogs![i];
    const next = rows.blogs![i];
    if (
      prev.image_url === next.image_url &&
      prev.media_asset_id === next.media_asset_id &&
      JSON.stringify(prev.content) === JSON.stringify(next.content)
    ) {
      continue;
    }
    const { error } = await admin
      .from("blog_posts")
      .update({
        image_url: next.image_url,
        media_asset_id: next.media_asset_id ?? null,
        content: next.content,
        updated_at: now,
      })
      .eq("id", next.id);
    if (error) throw new Error(error.message);
  }

  const prevSettings = new Map((before.settings ?? []).map((s) => [s.key, s.value]));
  for (const s of rows.settings ?? []) {
    if (prevSettings.get(s.key) === s.value) continue;
    const { error } = await admin
      .from("site_settings")
      .upsert({ key: s.key, value: s.value, updated_at: now }, { onConflict: "key" });
    if (error) throw new Error(error.message);
  }

  for (let i = 0; i < (before.landingSections?.length ?? 0); i++) {
    const prev = before.landingSections![i];
    const next = rows.landingSections![i];
    if (JSON.stringify(prev.content) === JSON.stringify(next.content)) continue;
    const { error } = await admin
      .from("landing_sections")
      .update({ content: next.content, updated_at: now })
      .eq("id", next.id);
    if (error) throw new Error(error.message);
  }

  for (let i = 0; i < (before.productImages?.length ?? 0); i++) {
    const prev = before.productImages![i];
    const next = rows.productImages![i];
    if (prev.url === next.url && prev.media_asset_id === next.media_asset_id) continue;
    const { error } = await admin
      .from("product_images")
      .update({
        url: next.url,
        media_asset_id: next.media_asset_id ?? null,
      })
      .eq("id", next.id);
    if (error) throw new Error(error.message);
  }

  for (let i = 0; i < (before.variants?.length ?? 0); i++) {
    const prev = before.variants![i];
    const next = rows.variants![i];
    if (prev.image_url === next.image_url) continue;
    const { error } = await admin
      .from("product_variants")
      .update({ image_url: next.image_url })
      .eq("id", next.id);
    if (error) throw new Error(error.message);
  }

  for (let i = 0; i < (before.categories?.length ?? 0); i++) {
    const prev = before.categories![i];
    const next = rows.categories![i];
    if (prev.image_url === next.image_url && prev.media_asset_id === next.media_asset_id) {
      continue;
    }
    const { error } = await admin
      .from("categories")
      .update({
        image_url: next.image_url,
        media_asset_id: next.media_asset_id ?? null,
      })
      .eq("id", next.id);
    if (error) throw new Error(error.message);
  }

  for (let i = 0; i < (before.partners?.length ?? 0); i++) {
    const prev = before.partners![i];
    const next = rows.partners![i];
    if (prev.logo_url === next.logo_url && prev.media_asset_id === next.media_asset_id) {
      continue;
    }
    const { error } = await admin
      .from("partners")
      .update({
        logo_url: next.logo_url,
        media_asset_id: next.media_asset_id ?? null,
      })
      .eq("id", next.id);
    if (error) throw new Error(error.message);
  }

  for (let i = 0; i < (before.partnersPages?.length ?? 0); i++) {
    const prev = before.partnersPages![i];
    const next = rows.partnersPages![i];
    if (JSON.stringify(prev.content) === JSON.stringify(next.content)) continue;
    const { error } = await admin
      .from("partners_page")
      .update({ content: next.content, updated_at: now })
      .eq("id", next.id);
    if (error) throw new Error(error.message);
  }

  await touchLastUsed({
    urls: [input.newUrl],
    assetIds: input.newAssetId ? [input.newAssetId] : [],
  }).catch(() => {});

  return summary;
}

