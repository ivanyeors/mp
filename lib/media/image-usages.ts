/**
 * Usage resolver (slice 10): where a Media Asset is attached.
 * Matches hosted_url and media_asset_id. Does not scan order_items.
 *
 * Email campaigns (PRD-campaign-email-editor slice 05) place images by Media
 * Asset id in their `content`; any campaign counts, draft, sent or archived,
 * and its use can never be deleted past (`usageBlocksDeletion`): a sent email
 * shows the image for good.
 */

import { getSlideMediaMap, SLIDE_PUBLIC_PATHS } from "@/lib/media/slide-media";

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
    | "partners_page"
    | "slide_media"
    | "item_overlay"
    | "item_image"
    | "email_campaign";
  label: string;
  ref_id: string;
};

/**
 * Pure — a use that no "Delete anyway" can override: an email campaign's.
 * A campaign that has sent shows the image from its email rendition for good,
 * and one that has not may yet.
 */
export function usageBlocksDeletion(entry: Pick<ImageUsageEntry, "type">): boolean {
  return entry.type === "email_campaign";
}

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
    /** Not read by any matcher (the label is derived from `id`); not selected. */
    product_id?: string;
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
  /** Slide configs + ambassadors (slice 17 resolved map). */
  slideMedia?: Array<{
    publicPath: string;
    src: string;
    assetId: string;
    consumer?: string;
  }>;
  /** Product Builder cover/case overlays (slice 10). */
  itemOverlays?: Array<{
    item_id: number;
    media_asset_id: string;
    item_name?: string | null;
  }>;
  /** Item primary media (slice 12 add-on card images). */
  items?: Array<{
    id: number;
    name: string;
    primary_media_asset_id: string | null;
  }>;
  /** Email campaigns with blocks: their images by asset id (campaign email editor slice 05). */
  emailCampaigns?: Array<{
    id: string;
    name: string;
    content: unknown;
  }>;
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

/**
 * The Media Assets a campaign's blocks place: each block's `image.asset`
 * (lib/email-campaigns/content.ts). Read from the row as stored, so a row
 * that no longer parses still counts what it names.
 */
export function campaignImageAssetIds(content: unknown): string[] {
  const blocks = content && typeof content === "object" ? (content as { blocks?: unknown }).blocks : null;
  if (!Array.isArray(blocks)) return [];
  return blocks.flatMap((b) => {
    const asset = b && typeof b === "object" ? (b as { image?: { asset?: unknown } }).image?.asset : undefined;
    return typeof asset === "string" && asset ? [asset] : [];
  });
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
        // Guard the empty-id shape (`listImageUsages(url)`): `"".includes("")`
        // is true, which used to mark every blog post as an inline usage and
        // made the delete precheck 409 whenever any post existed.
        if (asset.id && body.includes(asset.id)) {
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

    // Dual-write companion: landing_*_asset_id → same slot ref_id as URL key
    if (setting.key.endsWith("_asset_id")) {
      const baseKey = setting.key.slice(0, -"_asset_id".length);
      if (setting.value === asset.id) {
        usages.push({
          type: "landing_slot",
          label: SLOT_LABELS[baseKey] ?? baseKey,
          ref_id: baseKey,
        });
      }
      continue;
    }

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

  for (const m of rows.itemOverlays ?? []) {
    if (refsMatch(asset, { assetId: m.media_asset_id })) {
      usages.push({
        type: "item_overlay",
        label: m.item_name ? `Overlay: ${m.item_name}` : "Item overlay",
        ref_id: String(m.item_id),
      });
    }
  }

  for (const item of rows.items ?? []) {
    if (refsMatch(asset, { assetId: item.primary_media_asset_id })) {
      usages.push({
        type: "item_image",
        label: item.name,
        ref_id: String(item.id),
      });
    }
  }

  for (const slide of rows.slideMedia ?? []) {
    if (refsMatch(asset, { url: slide.src, assetId: slide.assetId })) {
      usages.push({
        type: "slide_media",
        label: slide.consumer ? `Slide (${slide.consumer})` : "Slide media",
        ref_id: slide.publicPath,
      });
    }
  }

  for (const c of rows.emailCampaigns ?? []) {
    if (asset.id && campaignImageAssetIds(c.content).includes(asset.id)) {
      usages.push({ type: "email_campaign", label: c.name, ref_id: c.id });
    }
  }

  return dedupe(usages);
}

/* ------------------------------------------------------------------ *
 * Inverted index
 *
 * `resolveUsages` answers "does this row reference this asset?" and the old
 * `indexUsages` asked it once per (asset, row) pair — O(assets × rows), with a
 * full deep walk of every JSON blob per asset. The inverted build below walks
 * each consumer row exactly once, extracts the asset keys it references, and
 * accumulates them into Map<assetKey, Usage[]>, so answering per asset is a
 * lookup. Detection logic is unchanged: every branch here mirrors the matching
 * rule of the corresponding branch in `resolveUsages`, and rows are visited in
 * the same order, so per-asset ordering (and dedupe) come out identical.
 * ------------------------------------------------------------------ */

/**
 * Aho-Corasick multi-pattern substring matcher.
 *
 * Several matchers ask "which of these N asset URLs/ids occur inside this
 * string" (blog bodies, landing slot values, JSON string leaves). Answering it
 * with N independent `String.includes` calls is what made the old scan
 * quadratic; one automaton answers all N in a single pass over the text.
 *
 * Patterns are indexed by code point, so `search` must iterate the text the
 * same way. Empty patterns are not supported — callers guard on truthiness.
 */
class SubstringMatcher {
  private readonly next: Array<Map<string, number>> = [new Map()];
  private readonly fail: number[] = [0];
  private readonly out: number[][] = [[]];
  /** Nearest proper suffix node that has output, or -1. */
  private readonly dict: number[] = [-1];
  private readonly patternIds = new Map<string, number>();
  private built = false;

  get size(): number {
    return this.patternIds.size;
  }

  /** Returns a stable id for `pattern`; identical patterns share one id. */
  add(pattern: string): number {
    const existing = this.patternIds.get(pattern);
    if (existing !== undefined) return existing;
    const id = this.patternIds.size;
    this.patternIds.set(pattern, id);
    let node = 0;
    for (const ch of pattern) {
      let child = this.next[node].get(ch);
      if (child === undefined) {
        child = this.next.length;
        this.next.push(new Map());
        this.fail.push(0);
        this.out.push([]);
        this.dict.push(-1);
        this.next[node].set(ch, child);
      }
      node = child;
    }
    this.out[node].push(id);
    this.built = false;
    return id;
  }

  private build(): void {
    if (this.built) return;
    const queue: number[] = [];
    for (const child of this.next[0].values()) {
      this.fail[child] = 0;
      queue.push(child);
    }
    for (let qi = 0; qi < queue.length; qi++) {
      const node = queue[qi];
      const f = this.fail[node];
      this.dict[node] = this.out[f].length > 0 ? f : this.dict[f];
      for (const [ch, child] of this.next[node]) {
        let probe = this.fail[node];
        while (probe !== 0 && !this.next[probe].has(ch)) probe = this.fail[probe];
        const candidate = this.next[probe].get(ch);
        this.fail[child] = candidate !== undefined && candidate !== child ? candidate : 0;
        queue.push(child);
      }
    }
    this.built = true;
  }

  /** Calls `hit` for every pattern id occurring anywhere in `text`. */
  search(text: string, hit: (patternId: number) => void): void {
    if (this.patternIds.size === 0 || text.length === 0) return;
    this.build();
    let node = 0;
    for (const ch of text) {
      while (node !== 0 && !this.next[node].has(ch)) node = this.fail[node];
      node = this.next[node].get(ch) ?? 0;
      for (let d = node; d !== -1; d = this.dict[d]) {
        for (const id of this.out[d]) hit(id);
      }
    }
  }
}

/** Identity of an AssetRef: two refs with the same id but different hosted_url resolve differently. */
type AssetKey = string;

function assetKeyOf(asset: AssetRef): AssetKey {
  return `${asset.id}\u0000${asset.hosted_url ?? ""}`;
}

type AssetIndex = {
  /** asset.id → keys (exact id matches). */
  byId: Map<string, AssetKey[]>;
  /** asset.hosted_url → keys (exact URL matches). */
  byUrl: Map<string, AssetKey[]>;
  matcher: SubstringMatcher;
  /** pattern id → keys of assets whose hosted_url is that pattern. */
  urlOwners: Map<number, AssetKey[]>;
  /** pattern id → keys of assets whose id is that pattern. */
  idOwners: Map<number, AssetKey[]>;
};

function pushInto(map: Map<string, AssetKey[]>, mapKey: string, key: AssetKey): void {
  const list = map.get(mapKey);
  if (list) list.push(key);
  else map.set(mapKey, [key]);
}

function pushOwner(map: Map<number, AssetKey[]>, patternId: number, key: AssetKey): void {
  const list = map.get(patternId);
  if (list) list.push(key);
  else map.set(patternId, [key]);
}

/**
 * Assets with an empty id are degenerate for the inverted build: `resolveUsages`
 * does `body.includes(asset.id)`, which is true for every string when the id is
 * "" (the `listImageUsages(url)` shape). They fall back to the direct scan so the
 * result stays bit-for-bit identical.
 */
function isDegenerateAsset(asset: AssetRef): boolean {
  return !asset.id;
}

function buildAssetIndex(assets: AssetRef[]): {
  index: AssetIndex;
  degenerate: AssetRef[];
} {
  const index: AssetIndex = {
    byId: new Map(),
    byUrl: new Map(),
    matcher: new SubstringMatcher(),
    urlOwners: new Map(),
    idOwners: new Map(),
  };
  const degenerate: AssetRef[] = [];
  const seen = new Set<AssetKey>();

  for (const asset of assets) {
    if (isDegenerateAsset(asset)) {
      degenerate.push(asset);
      continue;
    }
    const key = assetKeyOf(asset);
    if (seen.has(key)) continue;
    seen.add(key);

    pushInto(index.byId, asset.id, key);
    pushOwner(index.idOwners, index.matcher.add(asset.id), key);
    if (asset.hosted_url) {
      pushInto(index.byUrl, asset.hosted_url, key);
      pushOwner(index.urlOwners, index.matcher.add(asset.hosted_url), key);
    }
  }

  return { index, degenerate };
}

function addAll(out: Set<AssetKey>, keys: AssetKey[] | undefined): void {
  if (!keys) return;
  for (const k of keys) out.add(k);
}

/** Assets whose id is exactly `value` (mirrors `refsMatch`'s assetId branch). */
function addExactId(index: AssetIndex, value: string | null | undefined, out: Set<AssetKey>): void {
  if (!value) return;
  addAll(out, index.byId.get(value));
}

/** Assets whose hosted_url is exactly `value` (mirrors `refsMatch`'s url branch). */
function addExactUrl(index: AssetIndex, value: string | null | undefined, out: Set<AssetKey>): void {
  if (!value) return;
  addAll(out, index.byUrl.get(value));
}

/** Assets whose hosted_url (and optionally id) occurs anywhere inside `text`. */
function addSubstringMatches(
  index: AssetIndex,
  text: string,
  out: Set<AssetKey>,
  includeIds: boolean,
): void {
  if (!text) return;
  index.matcher.search(text, (patternId) => {
    addAll(out, index.urlOwners.get(patternId));
    if (includeIds) addAll(out, index.idOwners.get(patternId));
  });
}

/** Inverted `jsonRefsAsset`: every asset the blob references, in one walk. */
function collectJsonRefKeys(value: unknown, index: AssetIndex, out: Set<AssetKey>): void {
  if (value == null) return;
  if (typeof value === "string") {
    // Same three branches as jsonRefsAsset: hosted_url equality, id equality,
    // hosted_url substring. (jsonRefsAsset's `obj.media_asset_id` fast path is
    // subsumed: that field's value is also visited as a string leaf below.)
    addExactUrl(index, value, out);
    addExactId(index, value, out);
    addSubstringMatches(index, value, out, false);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectJsonRefKeys(v, index, out);
    return;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectJsonRefKeys(v, index, out);
    }
  }
}

/** Index usages by hosted URL and by asset id (for library grid). */
export function indexUsages(
  assets: AssetRef[],
  rows: UsageConsumerRows,
): { byUrl: Record<string, ImageUsageEntry[]>; byAssetId: Record<string, ImageUsageEntry[]> } {
  const { index, degenerate } = buildAssetIndex(assets);
  const acc = new Map<AssetKey, ImageUsageEntry[]>();

  // One entry object is shared by every asset that matched the same row; the
  // old code already shared list references between byUrl and byAssetId.
  const emit = (keys: Set<AssetKey>, entry: () => ImageUsageEntry): void => {
    if (keys.size === 0) return;
    const value = entry();
    for (const key of keys) {
      const list = acc.get(key);
      if (list) list.push(value);
      else acc.set(key, [value]);
    }
  };

  void rows.orderItems; // ponytail: explicit non-scan so tests can assert exclusion

  for (const blog of rows.blogs ?? []) {
    let label: string | null = null;
    const titleOf = () => (label ??= getBlogTitle(blog.content) || blog.slug);

    const featured = new Set<AssetKey>();
    addExactId(index, blog.media_asset_id, featured);
    addExactUrl(index, blog.image_url, featured);
    emit(featured, () => ({ type: "blog_featured", label: titleOf(), ref_id: blog.id }));

    // Inline: body/content refs only (not the featured image_url field alone)
    const inline = new Set<AssetKey>();
    const content = blog.content as Record<string, { body?: string }> | null;
    if (content) {
      for (const locale of Object.values(content)) {
        const body = locale?.body ?? "";
        if (typeof body !== "string") continue;
        addSubstringMatches(index, body, inline, true);
      }
    }
    const jsonKeys = new Set<AssetKey>();
    collectJsonRefKeys(blog.content, index, jsonKeys);
    for (const key of jsonKeys) {
      if (!featured.has(key)) inline.add(key);
    }
    emit(inline, () => ({ type: "blog_inline", label: titleOf(), ref_id: blog.id }));
  }

  for (const setting of rows.settings ?? []) {
    if (!setting.key.startsWith("landing_")) continue;

    // Dual-write companion: landing_*_asset_id → same slot ref_id as URL key
    if (setting.key.endsWith("_asset_id")) {
      const baseKey = setting.key.slice(0, -"_asset_id".length);
      const keys = new Set<AssetKey>();
      addExactId(index, setting.value, keys);
      emit(keys, () => ({
        type: "landing_slot",
        label: SLOT_LABELS[baseKey] ?? baseKey,
        ref_id: baseKey,
      }));
      continue;
    }

    const keys = new Set<AssetKey>();
    addExactUrl(index, setting.value, keys);
    addExactId(index, setting.value, keys);
    addSubstringMatches(index, setting.value, keys, false);
    emit(keys, () => ({
      type: "landing_slot",
      label: SLOT_LABELS[setting.key] ?? setting.key,
      ref_id: setting.key,
    }));
  }

  for (const section of rows.landingSections ?? []) {
    const keys = new Set<AssetKey>();
    collectJsonRefKeys(section.content, index, keys);
    emit(keys, () => ({ type: "landing_section", label: section.slug, ref_id: section.id }));
  }

  for (const img of rows.productImages ?? []) {
    const keys = new Set<AssetKey>();
    addExactId(index, img.media_asset_id, keys);
    addExactUrl(index, img.url, keys);
    emit(keys, () => ({
      type: "product_image",
      label: `Product ${img.product_id.slice(0, 8)}`,
      ref_id: img.id,
    }));
  }

  for (const v of rows.variants ?? []) {
    const keys = new Set<AssetKey>();
    addExactId(index, v.media_asset_id, keys);
    addExactUrl(index, v.image_url, keys);
    emit(keys, () => ({
      type: "product_variant",
      label: `Variant ${v.id.slice(0, 8)}`,
      ref_id: v.id,
    }));
  }

  for (const c of rows.categories ?? []) {
    const keys = new Set<AssetKey>();
    addExactId(index, c.media_asset_id, keys);
    addExactUrl(index, c.image_url, keys);
    emit(keys, () => ({ type: "category", label: c.slug, ref_id: c.id }));
  }

  for (const p of rows.partners ?? []) {
    const keys = new Set<AssetKey>();
    addExactId(index, p.media_asset_id, keys);
    addExactUrl(index, p.logo_url, keys);
    emit(keys, () => ({ type: "partner", label: p.name, ref_id: p.id }));
  }

  for (const page of rows.partnersPages ?? []) {
    const keys = new Set<AssetKey>();
    collectJsonRefKeys(page.content, index, keys);
    emit(keys, () => ({ type: "partners_page", label: "Partners page", ref_id: page.id }));
  }

  for (const m of rows.itemOverlays ?? []) {
    const keys = new Set<AssetKey>();
    addExactId(index, m.media_asset_id, keys);
    emit(keys, () => ({
      type: "item_overlay",
      label: m.item_name ? `Overlay: ${m.item_name}` : "Item overlay",
      ref_id: String(m.item_id),
    }));
  }

  for (const item of rows.items ?? []) {
    const keys = new Set<AssetKey>();
    addExactId(index, item.primary_media_asset_id, keys);
    emit(keys, () => ({ type: "item_image", label: item.name, ref_id: String(item.id) }));
  }

  for (const slide of rows.slideMedia ?? []) {
    const keys = new Set<AssetKey>();
    addExactId(index, slide.assetId, keys);
    addExactUrl(index, slide.src, keys);
    emit(keys, () => ({
      type: "slide_media",
      label: slide.consumer ? `Slide (${slide.consumer})` : "Slide media",
      ref_id: slide.publicPath,
    }));
  }

  for (const c of rows.emailCampaigns ?? []) {
    const keys = new Set<AssetKey>();
    for (const id of campaignImageAssetIds(c.content)) addExactId(index, id, keys);
    emit(keys, () => ({ type: "email_campaign", label: c.name, ref_id: c.id }));
  }

  const byUrl: Record<string, ImageUsageEntry[]> = {};
  const byAssetId: Record<string, ImageUsageEntry[]> = {};
  const degenerateSet = degenerate.length > 0 ? new Set(degenerate) : null;
  for (const asset of assets) {
    const list = degenerateSet?.has(asset)
      ? resolveUsages(asset, rows)
      : dedupe(acc.get(assetKeyOf(asset)) ?? []);
    if (list.length === 0) continue;
    byAssetId[asset.id] = list;
    if (asset.hosted_url) byUrl[asset.hosted_url] = list;
  }
  return { byUrl, byAssetId };
}

/* ------------------------------------------------------------------ *
 * Consumer row fetching
 * ------------------------------------------------------------------ */

export type ConsumerTable =
  | "blog_posts"
  | "site_settings"
  | "landing_sections"
  | "product_images"
  | "product_variants"
  | "categories"
  | "partners"
  | "partners_page"
  | "item_overlay_mappings"
  | "items"
  | "email_campaigns";

/**
 * Exactly the columns the matchers read: row ids/labels, the URL and asset-id
 * columns `refsMatch` compares, and the JSON columns `jsonRefsAsset` walks.
 * Both the full scan and the per-asset scan use these, so a rejected predicate
 * falls back to the same (narrow) select.
 */
const CONSUMER_SELECT: Record<ConsumerTable, string> = {
  // slug + content: label; image_url + media_asset_id: featured; content: inline
  blog_posts: "id, slug, image_url, content, media_asset_id",
  site_settings: "key, value",
  // draft_content included so an image referenced only by a pending Section draft
  // still reports as Used — CONTEXT.md is explicit that drafts count.
  landing_sections: "id, slug, content, draft_content",
  product_images: "id, product_id, url, media_asset_id",
  // product_id was selected but never read — the label is `Variant ${id}`.
  product_variants: "id, image_url",
  categories: "id, slug, image_url, media_asset_id",
  partners: "id, name, logo_url, media_asset_id",
  partners_page: "id, content",
  item_overlay_mappings: "item_id, media_asset_id, items ( name )",
  items: "id, name, primary_media_asset_id",
  // name: label; content: the blocks' images by asset id.
  email_campaigns: "id, name, content",
};

export type UsagePredicateTerm = { column: string; op: "eq" | "ilike"; value: string };

const equals = (column: string, value: string): UsagePredicateTerm => ({
  column,
  op: "eq",
  value,
});

/** `ilike` is only ever a *superset* of the JS matcher, which reruns exactly. */
const contains = (column: string, value: string): UsagePredicateTerm => ({
  column,
  op: "ilike",
  value: `%${value}%`,
});

/**
 * OR-combined predicate for one consumer table when resolving a single asset.
 *
 * - non-empty array → push it into the query
 * - `[]`            → not expressible, the table must be scanned in full
 * - `null`          → the table cannot match this asset at all, skip the query
 *
 * Every returned predicate is a superset of the JS matcher for that table (the
 * matcher still runs over the reduced rows), so the result equals a full scan.
 */
export function usagePredicateTerms(
  table: ConsumerTable,
  asset: AssetRef,
): UsagePredicateTerm[] | null {
  const id = asset.id;
  const url = asset.hosted_url ?? "";
  // An empty asset id makes `body.includes(asset.id)` and `value === asset.id`
  // true for every row (the `listImageUsages(url)` shape), so tables reached by
  // those rules cannot be narrowed at all.
  const byId = id.length > 0;

  switch (table) {
    case "blog_posts": {
      if (!byId) return [];
      const terms = [equals("media_asset_id", id), contains("content::text", id)];
      if (url) terms.push(equals("image_url", url), contains("content::text", url));
      return terms;
    }
    case "site_settings": {
      if (!byId) return [];
      const terms = [equals("value", id)];
      if (url) terms.push(contains("value", url));
      return terms;
    }
    case "landing_sections": {
      if (!byId) return [];
      const terms = [contains("content::text", id), contains("draft_content::text", id)];
      if (url) {
        terms.push(contains("content::text", url));
        terms.push(contains("draft_content::text", url));
      }
      return terms;
    }
    case "partners_page": {
      if (!byId) return [];
      const terms = [contains("content::text", id)];
      if (url) terms.push(contains("content::text", url));
      return terms;
    }
    case "product_images": {
      const terms: UsagePredicateTerm[] = [];
      if (byId) terms.push(equals("media_asset_id", id));
      if (url) terms.push(equals("url", url));
      return terms.length > 0 ? terms : null;
    }
    case "product_variants":
      // media_asset_id is not selected for variants, so only the URL can match.
      return url ? [equals("image_url", url)] : null;
    case "categories": {
      const terms: UsagePredicateTerm[] = [];
      if (byId) terms.push(equals("media_asset_id", id));
      if (url) terms.push(equals("image_url", url));
      return terms.length > 0 ? terms : null;
    }
    case "partners": {
      const terms: UsagePredicateTerm[] = [];
      if (byId) terms.push(equals("media_asset_id", id));
      if (url) terms.push(equals("logo_url", url));
      return terms.length > 0 ? terms : null;
    }
    case "item_overlay_mappings":
      return byId ? [equals("media_asset_id", id)] : null;
    case "items":
      return byId ? [equals("primary_media_asset_id", id)] : null;
    case "email_campaigns":
      // A campaign names its images by id only, so a URL alone cannot match one.
      return byId ? [contains("content::text", id)] : null;
  }
}

/** PostgREST `or=()` values only need quoting for the list separators. */
function orTermValue(value: string): string {
  if (!/[,()"\\]/.test(value) && value.trim() === value) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function usageOrFilter(terms: UsagePredicateTerm[]): string {
  return terms.map((t) => `${t.column}.${t.op}.${orTermValue(t.value)}`).join(",");
}

type ConsumerQuery = PromiseLike<{ data: unknown[] | null; error: unknown }>;

type FilterableQuery = {
  or(filters: string): FilterableQuery;
  filter(column: string, operator: string, value: unknown): FilterableQuery;
};

function applyTerms(query: ConsumerQuery, terms: UsagePredicateTerm[]): ConsumerQuery {
  if (terms.length === 0) return query;
  const q = query as unknown as FilterableQuery;
  const filtered =
    terms.length === 1
      ? q.filter(terms[0].column, terms[0].op, terms[0].value)
      : q.or(usageOrFilter(terms));
  return filtered as unknown as ConsumerQuery;
}

async function scanConsumer(
  table: ConsumerTable,
  asset: AssetRef | null,
  build: (terms: UsagePredicateTerm[]) => ConsumerQuery,
): Promise<unknown[]> {
  const terms = asset ? usagePredicateTerms(table, asset) : [];
  if (terms === null) return [];

  if (terms.length > 0) {
    let failure: unknown = null;
    try {
      const res = await build(terms);
      if (!res.error) return res.data ?? [];
      failure = res.error;
    } catch (err) {
      failure = err;
    }
    // PostgREST may reject a pushed-down predicate — most plausibly the
    // `content::text` cast. Correctness wins: rerun the same select unfiltered.
    console.warn(
      `[image-usages] usage predicate rejected for ${table}, falling back to full scan`,
      failure,
    );
  }

  const res = await build([]);
  return res.data ?? [];
}

type OverlayRow = {
  item_id: number;
  media_asset_id: string;
  items: { name: string | null } | { name: string | null }[] | null;
};

/**
 * All consumer rows (`asset === null`), or only the rows that can possibly
 * reference `asset`. Both shapes feed the same matchers.
 */
async function fetchConsumerRows(asset: AssetRef | null = null): Promise<UsageConsumerRows> {
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
    itemOverlays,
    items,
    emailCampaigns,
  ] = await Promise.all([
    scanConsumer("blog_posts", asset, (t) =>
      applyTerms(admin.from("blog_posts").select(CONSUMER_SELECT.blog_posts), t),
    ),
    scanConsumer("site_settings", asset, (t) =>
      applyTerms(
        admin.from("site_settings").select(CONSUMER_SELECT.site_settings).like("key", "landing_%"),
        t,
      ),
    ),
    scanConsumer("landing_sections", asset, (t) =>
      applyTerms(admin.from("landing_sections").select(CONSUMER_SELECT.landing_sections), t),
    ),
    scanConsumer("product_images", asset, (t) =>
      applyTerms(admin.from("product_images").select(CONSUMER_SELECT.product_images), t),
    ),
    scanConsumer("product_variants", asset, (t) =>
      applyTerms(admin.from("product_variants").select(CONSUMER_SELECT.product_variants), t),
    ),
    scanConsumer("categories", asset, (t) =>
      applyTerms(admin.from("categories").select(CONSUMER_SELECT.categories), t),
    ),
    scanConsumer("partners", asset, (t) =>
      applyTerms(admin.from("partners").select(CONSUMER_SELECT.partners), t),
    ),
    scanConsumer("partners_page", asset, (t) =>
      applyTerms(admin.from("partners_page").select(CONSUMER_SELECT.partners_page), t),
    ),
    scanConsumer("item_overlay_mappings", asset, (t) =>
      applyTerms(
        admin.from("item_overlay_mappings").select(CONSUMER_SELECT.item_overlay_mappings),
        t,
      ),
    ),
    scanConsumer("items", asset, (t) =>
      applyTerms(
        admin
          .from("items")
          .select(CONSUMER_SELECT.items)
          .not("primary_media_asset_id", "is", null),
        t,
      ),
    ),
    // Every campaign with blocks, archived ones too: a sent email keeps its images.
    scanConsumer("email_campaigns", asset, (t) =>
      applyTerms(admin.from("email_campaigns").select(CONSUMER_SELECT.email_campaigns).not("content", "is", null), t),
    ),
  ]);

  return {
    blogs: blogs as UsageConsumerRows["blogs"],
    settings: settings as UsageConsumerRows["settings"],
    landingSections: landingSections as UsageConsumerRows["landingSections"],
    productImages: productImages as UsageConsumerRows["productImages"],
    variants: variants as UsageConsumerRows["variants"],
    categories: categories as UsageConsumerRows["categories"],
    partners: partners as UsageConsumerRows["partners"],
    partnersPages: partnersPages as UsageConsumerRows["partnersPages"],
    itemOverlays: (itemOverlays as OverlayRow[]).map((m) => {
      const item = Array.isArray(m.items) ? m.items[0] : m.items;
      return {
        item_id: m.item_id,
        media_asset_id: m.media_asset_id,
        item_name: item?.name ?? null,
      };
    }),
    items: items as UsageConsumerRows["items"],
    emailCampaigns: emailCampaigns as UsageConsumerRows["emailCampaigns"],
  };
}

/** Only the consumer rows that can reference `asset` (predicate pushdown). */
export async function fetchConsumerRowsForAsset(asset: AssetRef): Promise<UsageConsumerRows> {
  return fetchConsumerRows(asset);
}

/** Where a hosted image URL is attached (legacy + expanded scanners). */
export async function listImageUsages(url: string): Promise<ImageUsageEntry[]> {
  return listAssetUsages({ id: "", hosted_url: url });
}

function slideMediaRowsFromMap(): UsageConsumerRows["slideMedia"] {
  const consumerByPath = new Map(SLIDE_PUBLIC_PATHS.map((p) => [p.publicPath, p.consumer]));
  return Object.entries(getSlideMediaMap()).map(([publicPath, v]) => ({
    publicPath,
    src: v.src,
    assetId: v.assetId,
    consumer: consumerByPath.get(publicPath),
  }));
}

/**
 * Full Asset usage (URL + id matching).
 *
 * Only fetches rows that can reference this asset; the matcher below is the
 * same one the full scan runs, so the answer is identical.
 */
export async function listAssetUsages(asset: AssetRef): Promise<ImageUsageEntry[]> {
  const rows = await fetchConsumerRowsForAsset(asset);
  rows.slideMedia = slideMediaRowsFromMap();
  return resolveUsages(asset, rows);
}

/** URL → usages map for Media library grid (all Assets with hosted_url). */
export async function buildUsageMap(
  assets: AssetRef[],
): Promise<Record<string, ImageUsageEntry[]>> {
  const rows = await fetchConsumerRows();
  rows.slideMedia = slideMediaRowsFromMap();
  return indexUsages(assets, rows).byUrl;
}
