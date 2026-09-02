/**
 * Test-only helpers for the media usage resolver.
 *
 * Not a test file (vitest only collects `*.test.ts`): it holds the seeded row
 * generator and a fake PostgREST query layer shared by the usage index and
 * single-asset equivalence suites.
 */

import type { AssetRef, UsageConsumerRows } from "@/lib/media/image-usages";

/* ------------------------------------------------------------------ *
 * Deterministic PRNG
 * ------------------------------------------------------------------ */

export type Rng = {
  next(): number;
  int(maxExclusive: number): number;
  bool(p?: number): boolean;
  pick<T>(items: readonly T[]): T;
};

export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive) => Math.floor(next() * maxExclusive),
    bool: (p = 0.5) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)],
  };
}

/* ------------------------------------------------------------------ *
 * Synthetic consumer rows
 * ------------------------------------------------------------------ */

export type FakeRow = Record<string, unknown>;
export type FakeTables = Record<string, FakeRow[]>;

export type UsageFixture = {
  /** Asset refs to resolve, including duplicates and null hosted_url. */
  assets: AssetRef[];
  /** DB-shaped rows for the fake query layer. */
  tables: FakeTables;
  /** The same rows as the matchers see them after a full scan. */
  rows: UsageConsumerRows;
};

function uuid(rng: Rng): string {
  const hex = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 32; i++) out += hex[rng.int(16)];
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-${out.slice(12, 16)}-${out.slice(16, 20)}-${out.slice(20)}`;
}

export type FixtureOptions = {
  assetCount?: number;
  rowsPerTable?: number;
};

/**
 * Builds a consumer set designed to exercise every matcher branch: exact URL
 * hits, media_asset_id hits, ids and URLs buried in JSON, URLs embedded in blog
 * bodies (substring, not equality), assets sharing a hosted_url, assets whose
 * URL is a prefix of another asset's URL, and rows that match nothing.
 */
export function makeUsageFixture(seed: number, opts: FixtureOptions = {}): UsageFixture {
  const rng = makeRng(seed);
  const assetCount = opts.assetCount ?? 40;
  const perTable = opts.rowsPerTable ?? 24;

  const base = "https://cdn.example/storage/v1/object/public/media";
  const assets: AssetRef[] = [];
  for (let i = 0; i < assetCount; i++) {
    const id = uuid(rng);
    let hosted: string | null = `${base}/img-${i}.webp`;
    if (i % 11 === 0) hosted = null; // id-only asset
    if (i % 13 === 0) hosted = `${base}/img-${i}.webp?v=2`; // superstring of a sibling URL
    if (i % 17 === 0 && assets.length > 0) hosted = assets[0].hosted_url; // shared URL
    assets.push({ id, hosted_url: hosted });
  }
  // Duplicated ref, and a same-id/different-url ref: both must resolve as before.
  assets.push({ ...assets[1] });
  assets.push({ id: assets[2].id, hosted_url: `${base}/unreferenced.webp` });

  const knownUrls = assets.map((a) => a.hosted_url).filter((u): u is string => !!u);
  const knownIds = assets.map((a) => a.id);
  const strangerUrls = [`${base}/stranger-a.webp`, `${base}/stranger-b.png`, ""];
  const strangerIds = [uuid(rng), uuid(rng)];

  /** A URL that is usually, but not always, one of the indexed assets'. */
  const someUrl = (): string | null => {
    const r = rng.next();
    if (r < 0.45) return rng.pick(knownUrls);
    if (r < 0.6) return rng.pick(strangerUrls);
    if (r < 0.7) return null;
    return `${base}/loose-${rng.int(50)}.webp`;
  };
  const someId = (): string | null => {
    const r = rng.next();
    if (r < 0.4) return rng.pick(knownIds);
    if (r < 0.5) return rng.pick(strangerIds);
    return null;
  };

  const jsonBlob = (depth = 0): unknown => {
    const r = rng.next();
    if (depth > 2 || r < 0.2) {
      const s = rng.next();
      if (s < 0.4) return someUrl();
      if (s < 0.6) return someId();
      if (s < 0.7) return rng.int(1000);
      if (s < 0.75) return null;
      if (s < 0.8) return rng.bool();
      return `text ${rng.int(100)}`;
    }
    if (r < 0.45) {
      const n = rng.int(3) + 1;
      return Array.from({ length: n }, () => jsonBlob(depth + 1));
    }
    const obj: Record<string, unknown> = {};
    const n = rng.int(3) + 1;
    for (let i = 0; i < n; i++) obj[`k${rng.int(6)}`] = jsonBlob(depth + 1);
    if (rng.bool(0.3)) obj.media_asset_id = someId();
    if (rng.bool(0.3)) obj.image = someUrl();
    return obj;
  };

  const body = (): string => {
    const parts: string[] = [`<p>lorem ${rng.int(999)}</p>`];
    if (rng.bool(0.45)) parts.push(`![alt](${someUrl() ?? "none"})`);
    if (rng.bool(0.2)) parts.push(`<Asset id="${someId() ?? "none"}" />`);
    return parts.join("\n");
  };

  const blogContent = (): unknown => {
    const r = rng.next();
    if (r < 0.08) return null;
    if (r < 0.12) return "not-an-object";
    const content: Record<string, unknown> = {};
    for (const locale of ["en-US", "de-DE"]) {
      if (rng.bool(0.8)) {
        content[locale] = {
          title: rng.bool(0.8) ? `Post ${rng.int(500)}` : "",
          body: body(),
          ...(rng.bool(0.25) ? { hero: { media_asset_id: someId() } } : {}),
        };
      }
    }
    return content;
  };

  const blogPosts: FakeRow[] = Array.from({ length: perTable }, (_, i) => ({
    id: `blog-${seed}-${i}`,
    slug: `slug-${i}`,
    image_url: someUrl(),
    content: blogContent(),
    media_asset_id: someId(),
    // Columns the matchers must never need:
    author_id: `author-${i}`,
    published_at: "2026-01-01",
  }));

  const slotKeys = [
    "landing_hero",
    "landing_founder",
    "landing_marquee",
    "landing_hero_asset_id",
    "landing_founder_asset_id",
    "landing_unknown_slot",
  ];
  const siteSettings: FakeRow[] = slotKeys.map((key) => ({
    key,
    value: key.endsWith("_asset_id")
      ? (someId() ?? "")
      : rng.bool(0.5)
        ? (someUrl() ?? "")
        : `url(${someUrl() ?? ""}) center`,
    updated_at: "2026-01-01",
  }));
  // Non-landing keys exist in the table but are excluded by the base filter.
  siteSettings.push({ key: "checkout_mode", value: rng.pick(knownUrls) });

  const landingSections: FakeRow[] = Array.from({ length: perTable }, (_, i) => ({
    id: `section-${seed}-${i}`,
    slug: `section-slug-${i}`,
    content: jsonBlob(),
    position: i,
  }));

  const productImages: FakeRow[] = Array.from({ length: perTable }, (_, i) => ({
    id: `pi-${seed}-${i}`,
    product_id: `product-${uuid(rng)}`,
    url: someUrl() ?? "",
    media_asset_id: someId(),
    sort_order: i,
  }));

  const productVariants: FakeRow[] = Array.from({ length: perTable }, (_, i) => ({
    id: `variant-${uuid(rng)}`,
    product_id: `product-${uuid(rng)}`,
    image_url: someUrl(),
    media_asset_id: someId(),
    price_cents: 1000 + i,
  }));

  const categories: FakeRow[] = Array.from({ length: Math.ceil(perTable / 2) }, (_, i) => ({
    id: `cat-${seed}-${i}`,
    slug: `cat-slug-${i}`,
    image_url: someUrl(),
    media_asset_id: someId(),
  }));

  const partners: FakeRow[] = Array.from({ length: Math.ceil(perTable / 2) }, (_, i) => ({
    id: `partner-${seed}-${i}`,
    name: `Partner ${i}`,
    logo_url: someUrl(),
    media_asset_id: someId(),
  }));

  const partnersPage: FakeRow[] = Array.from({ length: 3 }, (_, i) => ({
    id: `pp-${seed}-${i}`,
    content: jsonBlob(),
  }));

  const itemOverlays: FakeRow[] = Array.from({ length: perTable }, (_, i) => ({
    item_id: i + 1,
    media_asset_id: someId() ?? rng.pick(strangerIds),
    items: rng.bool(0.8) ? { name: `Item ${i}` } : null,
  }));

  const items: FakeRow[] = Array.from({ length: perTable }, (_, i) => ({
    id: i + 1,
    name: `Item ${i}`,
    primary_media_asset_id: someId(),
  }));

  const tables: FakeTables = {
    blog_posts: blogPosts,
    site_settings: siteSettings,
    landing_sections: landingSections,
    product_images: productImages,
    product_variants: productVariants,
    categories,
    partners,
    partners_page: partnersPage,
    item_overlay_mappings: itemOverlays,
    items,
  };

  const rows: UsageConsumerRows = {
    blogs: blogPosts as UsageConsumerRows["blogs"],
    settings: siteSettings.filter((s) =>
      String(s.key).startsWith("landing_"),
    ) as UsageConsumerRows["settings"],
    landingSections: landingSections as UsageConsumerRows["landingSections"],
    productImages: productImages as UsageConsumerRows["productImages"],
    variants: productVariants as UsageConsumerRows["variants"],
    categories: categories as UsageConsumerRows["categories"],
    partners: partners as UsageConsumerRows["partners"],
    partnersPages: partnersPage as UsageConsumerRows["partnersPages"],
    itemOverlays: itemOverlays.map((m) => ({
      item_id: m.item_id as number,
      media_asset_id: m.media_asset_id as string,
      item_name: (m.items as { name: string | null } | null)?.name ?? null,
    })),
    items: items.filter(
      (i) => i.primary_media_asset_id != null,
    ) as UsageConsumerRows["items"],
    // Never scanned; present so the exclusion stays covered.
    orderItems: [{ id: "oi1", image_url: knownUrls[0] ?? null }],
  };

  return { assets, tables, rows };
}

/* ------------------------------------------------------------------ *
 * Fake PostgREST query layer
 * ------------------------------------------------------------------ */

type Predicate = (row: FakeRow) => boolean;

export type QueryLogEntry = {
  table: string;
  select: string;
  filters: string[];
  returned: number;
};

function columnValue(row: FakeRow, column: string): unknown {
  if (column.includes("::")) {
    const [name, cast] = column.split("::");
    const raw = row[name];
    if (cast === "text") return raw === undefined ? null : JSON.stringify(raw ?? null);
    return raw;
  }
  return row[column];
}

function likeRegExp(pattern: string, caseInsensitive: boolean): RegExp {
  const body = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/%/g, "[\\s\\S]*")
    .replace(/_/g, "[\\s\\S]");
  return new RegExp(`^${body}$`, caseInsensitive ? "i" : "");
}

function evaluate(row: FakeRow, column: string, op: string, value: string): boolean {
  const actual = columnValue(row, column);
  switch (op) {
    case "eq":
      return actual != null && String(actual) === value;
    case "neq":
      return actual == null || String(actual) !== value;
    case "like":
    case "ilike":
      return actual != null && likeRegExp(value, op === "ilike").test(String(actual));
    case "is":
      return value === "null" ? actual == null : String(actual) === value;
    default:
      throw new Error(`fake postgrest: unsupported operator ${op}`);
  }
}

/** Splits an `or=(...)` body on top-level commas, honouring quoted values. */
function splitOrTerms(filters: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < filters.length; i++) {
    const ch = filters[i];
    if (quoted && ch === "\\") {
      cur += ch + (filters[i + 1] ?? "");
      i++;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      cur += ch;
      continue;
    }
    if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.length > 0) out.push(cur);
  return out;
}

function dequote(value: string): string {
  if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) return value;
  const inner = value.slice(1, -1);
  let out = "";
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "\\") {
      out += inner[i + 1] ?? "";
      i++;
    } else {
      out += inner[i];
    }
  }
  return out;
}

function parseOrTerm(term: string): { column: string; op: string; value: string } {
  const first = term.indexOf(".");
  const second = term.indexOf(".", first + 1);
  if (first < 0 || second < 0) throw new Error(`fake postgrest: bad or() term "${term}"`);
  return {
    column: term.slice(0, first),
    op: term.slice(first + 1, second),
    value: dequote(term.slice(second + 1)),
  };
}

/** Top-level column names of a select list ("items ( name )" → "items"). */
function selectColumns(select: string): string[] {
  const out: string[] = [];
  let cur = "";
  let depth = 0;
  for (const ch of select) {
    if (ch === "(") {
      depth++;
      continue;
    }
    if (ch === ")") {
      depth--;
      continue;
    }
    if (depth > 0) continue;
    if (ch === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim()).filter(Boolean);
}

export type FakeSupabaseOptions = {
  /** Simulate a PostgREST build that rejects `column::text` filters. */
  rejectCastFilters?: boolean;
};

class FakeQuery implements PromiseLike<{ data: FakeRow[] | null; error: unknown }> {
  private readonly predicates: Predicate[] = [];
  private readonly described: string[] = [];
  private columns: string[] = [];
  private rejected = false;

  constructor(
    private readonly table: string,
    private readonly rows: FakeRow[],
    private readonly log: QueryLogEntry[],
    private readonly opts: FakeSupabaseOptions,
    private select_ = "*",
  ) {}

  select(columns: string): this {
    this.select_ = columns;
    this.columns = selectColumns(columns);
    return this;
  }

  private add(column: string, op: string, value: string): this {
    this.described.push(`${column}.${op}.${value}`);
    if (this.opts.rejectCastFilters && column.includes("::")) this.rejected = true;
    this.predicates.push((row) => evaluate(row, column, op, value));
    return this;
  }

  eq(column: string, value: unknown): this {
    return this.add(column, "eq", String(value));
  }

  like(column: string, pattern: string): this {
    return this.add(column, "like", pattern);
  }

  ilike(column: string, pattern: string): this {
    return this.add(column, "ilike", pattern);
  }

  not(column: string, op: string, value: unknown): this {
    this.described.push(`not.${column}.${op}.${String(value)}`);
    this.predicates.push((row) => !evaluate(row, column, op, value === null ? "null" : String(value)));
    return this;
  }

  filter(column: string, op: string, value: unknown): this {
    return this.add(column, op, String(value));
  }

  or(filters: string): this {
    this.described.push(`or(${filters})`);
    const terms = splitOrTerms(filters).map(parseOrTerm);
    for (const t of terms) {
      if (this.opts.rejectCastFilters && t.column.includes("::")) this.rejected = true;
    }
    this.predicates.push((row) => terms.some((t) => evaluate(row, t.column, t.op, t.value)));
    return this;
  }

  private run(): { data: FakeRow[] | null; error: unknown } {
    if (this.rejected) {
      this.log.push({
        table: this.table,
        select: this.select_,
        filters: [...this.described],
        returned: 0,
      });
      return {
        data: null,
        error: { message: `cannot cast column in filter on ${this.table}`, code: "42846" },
      };
    }
    const matched = this.rows.filter((row) => this.predicates.every((p) => p(row)));
    const projected =
      this.columns.length === 0
        ? matched
        : matched.map((row) => {
            const out: FakeRow = {};
            for (const c of this.columns) out[c] = row[c];
            return out;
          });
    this.log.push({
      table: this.table,
      select: this.select_,
      filters: [...this.described],
      returned: projected.length,
    });
    return { data: projected, error: null };
  }

  then<R1 = { data: FakeRow[] | null; error: unknown }, R2 = never>(
    onFulfilled?:
      | ((value: { data: FakeRow[] | null; error: unknown }) => R1 | PromiseLike<R1>)
      | null,
    onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected);
  }
}

export function createFakeSupabase(tables: FakeTables, opts: FakeSupabaseOptions = {}) {
  const log: QueryLogEntry[] = [];
  const client = {
    from(table: string) {
      return new FakeQuery(table, tables[table] ?? [], log, opts);
    },
  };
  return {
    client,
    log,
    rowsRead: () => log.reduce((n, entry) => n + entry.returned, 0),
    reset: () => {
      log.length = 0;
    },
  };
}
