import { z } from "zod";
import { PURCHASE_CLASSES, type PurchaseClass } from "@/lib/crm/customer-overview";
import { escapeLikePattern } from "@/lib/supabase/like-pattern";

/**
 * The Customers list's URL parameters, and how they become a query on the
 * Customer overview (`admin_customer_overview`, lib/crm/customer-overview.ts).
 *
 * One schema and one mapping for every caller (CRM slice 04):
 * `customerFiltersSchema` reads the parameters, `applyCustomerFilters` turns
 * them into the query, and `listAdminCustomers` reads its filters through both.
 * The RSC page, `GET /api/shop/customers` and CRM slice 05's Segments therefore
 * agree: a Segment stores these same parameters and reads them back through
 * the same schema, so it and the same link return the same Customers. The
 * list's client writes its URL with `customerFilterParams`, so a filtered list
 * is a link (migration slice 12).
 *
 * CRM slice 11 adds Contact status: Google linked or not, and the mobile on
 * file. *Email verified* is the Account filter: an account is bound by the
 * email they signed in with, so *Signed up* means exactly that.
 *
 * Each parameter is read on its own: an unknown value (`bought=foo`) is
 * dropped and named in `ignored`, never passed to the query.
 *
 * No typed text reaches a PostgREST `.or()` (ADR 0027 (d)): search is one
 * `ilike` on `search_text` with its wildcards escaped, typed lists go in as
 * quoted array literals, and `CustomerListQuery` has no `or` at all.
 */

export const ACCOUNT_FILTERS = ["all", "signed-up", "no-account"] as const;
export type AccountFilter = (typeof ACCOUNT_FILTERS)[number];

export const SOURCE_FILTERS = ["all", "shopify", "platform"] as const;
export type SourceFilter = (typeof SOURCE_FILTERS)[number];

export const GOOGLE_FILTERS = ["all", "linked", "not-linked"] as const;
export type GoogleFilter = (typeof GOOGLE_FILTERS)[number];

/** *On file* is a valid number, *invalid* one that fails `isValidPhone`, *missing* none. */
export const MOBILE_FILTERS = ["all", "on-file", "missing", "invalid"] as const;
export type MobileFilter = (typeof MOBILE_FILTERS)[number];

/** *Bought*: any of these, from the overview's `bought` (CRM slice 04). */
export const BOUGHT_FILTERS = PURCHASE_CLASSES;
export type BoughtFilter = PurchaseClass;

/** *Re-adjusted*: an attended **Re-adjustment booking**, ever or never. */
export const READJUSTED_FILTERS = ["ever", "never"] as const;
export type ReadjustedFilter = (typeof READJUSTED_FILTERS)[number];

/**
 * *Last order*: the latest counted **Order** was paid within the last N
 * months (`within:6`), or more than N months ago (`over:12`). A Customer with
 * no counted Order matches neither.
 */
export interface LastOrderFilter {
  when: "within" | "over";
  months: number;
}
export const LAST_ORDER_MONTHS_MAX = 120;

export const CUSTOMER_SORTS = [
  "newest",
  "oldest",
  "name-asc",
  "name-desc",
  "signed-up",
  "last-order",
  "spend",
] as const;
export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export const CUSTOMER_PAGE_LIMIT_MAX = 100;

export interface CustomerFilters {
  search: string | null;
  tags: string[];
  /** Account status: *Signed up* (`has_account`) or *No account*. */
  account: AccountFilter;
  /** *From Shopify* is a **Migrated customer**; *Platform* is every other Customer. */
  source: SourceFilter;
  /** Signs in with Google (`account_providers`); *not linked* includes no account. */
  google: GoogleFilter;
  /** The mobile on file (`has_phone`, `phone_valid`). */
  mobile: MobileFilter;
  /** Bought any of these on a counted Order; empty for no filter. */
  bought: BoughtFilter[];
  last_order: LastOrderFilter | null;
  readjusted: ReadjustedFilter | null;
  /** `total_spent` (platform Orders) at least this; null for no filter. */
  min_spend: number | null;
  sort: CustomerSort;
  page: number;
  limit: number;
}

export const DEFAULT_CUSTOMER_FILTERS: CustomerFilters = {
  search: null,
  tags: [],
  account: "all",
  source: "all",
  google: "all",
  mobile: "all",
  bought: [],
  last_order: null,
  readjusted: null,
  min_spend: null,
  sort: "newest",
  page: 1,
  limit: 20,
};

/** A comma-separated list (`vip,wholesale`), trimmed, blanks dropped. */
const commaList = z.string().transform((v) =>
  v
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean),
);

const PARAM_SCHEMAS = {
  search: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
  tags: commaList,
  account: z.enum(ACCOUNT_FILTERS),
  source: z.enum(SOURCE_FILTERS),
  google: z.enum(GOOGLE_FILTERS),
  mobile: z.enum(MOBILE_FILTERS),
  // Any unknown value drops the whole parameter. Kept in BOUGHT_FILTERS order,
  // once each, so the same set always writes the same URL.
  bought: commaList
    .pipe(z.array(z.enum(BOUGHT_FILTERS)))
    .transform((v) => BOUGHT_FILTERS.filter((c) => v.includes(c))),
  last_order: z
    .string()
    .regex(/^(within|over):\d{1,3}$/)
    .transform((v) => {
      const [when, months] = v.split(":");
      return { when: when as LastOrderFilter["when"], months: Number(months) };
    })
    .pipe(
      z.object({
        when: z.enum(["within", "over"]),
        months: z.number().int().min(1).max(LAST_ORDER_MONTHS_MAX),
      }),
    ),
  readjusted: z.enum(READJUSTED_FILTERS),
  // A plain amount, at most two decimals: never an exponent or a sign.
  min_spend: z
    .string()
    .regex(/^\d{1,7}(\.\d{1,2})?$/)
    .transform(Number)
    .pipe(z.number().positive()),
  sort: z.enum(CUSTOMER_SORTS),
  page: z.coerce.number().int().min(1),
  // An oversized limit is capped, as before, rather than dropped.
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .transform((v) => Math.min(v, CUSTOMER_PAGE_LIMIT_MAX)),
} satisfies { [K in keyof CustomerFilters]: z.ZodType<CustomerFilters[K]> };

/**
 * The one schema for the Customers list's filters: each URL parameter, as the
 * string the URL holds, to the value the query uses. Every key is optional.
 * `parseCustomerFilters` reads a URL through it key by key, so one bad value
 * drops only itself. A Segment (CRM slice 05) stores the same parameters
 * (`customerFilterParams`) and is read back through this schema too.
 */
export const customerFiltersSchema = z.object(PARAM_SCHEMAS).partial();

type FilterKey = keyof typeof PARAM_SCHEMAS;
const FILTER_KEYS = Object.keys(PARAM_SCHEMAS) as FilterKey[];

/** A URL key the list's filters own. */
export type CustomerFilterParam = FilterKey;

/** Every URL key the list's filters own; any other key (`view`) is left alone. */
export const CUSTOMER_FILTER_PARAMS: readonly FilterKey[] = FILTER_KEYS;

/** The keys that only order or page the list; every other key chooses Customers. */
const VIEW_KEYS = ["sort", "page", "limit"] as const satisfies readonly FilterKey[];
export type CustomerFilterKey = Exclude<FilterKey, (typeof VIEW_KEYS)[number]>;

/**
 * The keys that choose which Customers are listed: what the active-filter
 * summary shows, what *Clear all* resets, and what a Segment saves.
 */
export const CUSTOMER_FILTER_KEYS = FILTER_KEYS.filter(
  (k): k is CustomerFilterKey => !(VIEW_KEYS as readonly string[]).includes(k),
);

/** The filters and the sort, without paging: what the list's client holds. */
export type CustomerListFilters = Omit<CustomerFilters, "page" | "limit">;

/** Only what chooses Customers: the summary's and a Segment's view of the filters. */
type ChosenFilters = Pick<CustomerFilters, CustomerFilterKey>;

export interface ParsedCustomerFilters {
  filters: CustomerFilters;
  /** Parameters that were present but invalid, and so not applied. */
  ignored: FilterKey[];
}

export function parseCustomerFilters(params: URLSearchParams): ParsedCustomerFilters {
  const filters: CustomerFilters = { ...DEFAULT_CUSTOMER_FILTERS, tags: [], bought: [] };
  const ignored: FilterKey[] = [];
  for (const key of FILTER_KEYS) {
    const raw = params.get(key);
    if (raw == null) continue;
    const parsed = customerFiltersSchema.shape[key].safeParse(raw);
    if (parsed.success && parsed.data !== undefined) (filters as Record<FilterKey, unknown>)[key] = parsed.data;
    else ignored.push(key);
  }
  return { filters, ignored };
}

/** A Next.js page's `searchParams` as URLSearchParams; a repeated key keeps its first value. */
export function searchParamsFromRecord(record: Record<string, string | string[] | undefined>): URLSearchParams {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first != null) out.set(key, first);
  }
  return out;
}

/**
 * The URL for `filters`: only what differs from the default, so the plain
 * list stays `/settings/customers`. Paging is left out unless asked for: the
 * list keeps its page in state.
 */
export function customerFilterParams(
  filters: Partial<CustomerFilters>,
  { paging = false }: { paging?: boolean } = {},
): URLSearchParams {
  const f: CustomerFilters = { ...DEFAULT_CUSTOMER_FILTERS, ...filters };
  const out = new URLSearchParams();
  if (f.search) out.set("search", f.search);
  if (f.tags.length) out.set("tags", f.tags.join(","));
  if (f.account !== "all") out.set("account", f.account);
  if (f.source !== "all") out.set("source", f.source);
  if (f.google !== "all") out.set("google", f.google);
  if (f.mobile !== "all") out.set("mobile", f.mobile);
  if (f.bought.length) out.set("bought", f.bought.join(","));
  if (f.last_order) out.set("last_order", `${f.last_order.when}:${f.last_order.months}`);
  if (f.readjusted) out.set("readjusted", f.readjusted);
  if (f.min_spend != null) out.set("min_spend", String(Math.round(f.min_spend * 100) / 100));
  if (f.sort !== DEFAULT_CUSTOMER_FILTERS.sort) out.set("sort", f.sort);
  if (paging) {
    out.set("page", String(f.page));
    out.set("limit", String(f.limit));
  }
  return out;
}

/** Whether `key` chooses fewer Customers than the default does. */
export function isCustomerFilterActive(filters: ChosenFilters, key: CustomerFilterKey): boolean {
  const value = filters[key];
  return Array.isArray(value) ? value.length > 0 : value !== DEFAULT_CUSTOMER_FILTERS[key];
}

/** `filters` with `key` back at its default: the × on its summary chip. */
export function clearCustomerFilter<F extends ChosenFilters>(filters: F, key: CustomerFilterKey): F {
  return { ...filters, [key]: DEFAULT_CUSTOMER_FILTERS[key] };
}

/** `filters` with every Customer-choosing key back at its default; the sort and paging stay. */
export function clearCustomerFilters<F extends ChosenFilters>(filters: F): F {
  return CUSTOMER_FILTER_KEYS.reduce((f, key) => clearCustomerFilter(f, key), filters);
}

export const BOUGHT_LABELS: Record<BoughtFilter, string> = {
  premium: "Premium Mpillow",
  basic: "Basic Mpillow",
  mbolster: "Mbolster",
  accessory: "Accessories",
};

const spend = new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" });

/** How each filter reads in the summary above the list. */
const FILTER_LABELS: { [K in CustomerFilterKey]: (value: NonNullable<CustomerFilters[K]>) => string } = {
  search: (v) => `Search: “${v}”`,
  tags: (v) => `Tags: ${v.join(", ")}`,
  account: (v) => (v === "signed-up" ? "Signed up" : "No account"),
  source: (v) => (v === "shopify" ? "From Shopify" : "Platform"),
  google: (v) => (v === "linked" ? "Google linked" : "Google not linked"),
  mobile: (v) => (v === "on-file" ? "Valid mobile on file" : v === "missing" ? "Mobile missing" : "Mobile invalid"),
  bought: (v) => `Bought ${v.map((c) => BOUGHT_LABELS[c]).join(" or ")}`,
  last_order: (v) =>
    v.when === "within"
      ? `Last order within ${monthsLabel(v.months)}`
      : `Last order over ${monthsLabel(v.months)} ago`,
  readjusted: (v) => (v === "ever" ? "Re-adjusted" : "Never re-adjusted"),
  min_spend: (v) => `Spent at least ${spend.format(v)}`,
};

function monthsLabel(months: number): string {
  if (months % 12 === 0) return months === 12 ? "a year" : `${months / 12} years`;
  return months === 1 ? "a month" : `${months} months`;
}

/** The active filters, each with its summary label, in URL order. */
export function describeCustomerFilters(filters: ChosenFilters): { key: CustomerFilterKey; label: string }[] {
  return CUSTOMER_FILTER_KEYS.filter((key) => isCustomerFilterActive(filters, key)).map((key) => ({
    key,
    label: (FILTER_LABELS[key] as (v: unknown) => string)(filters[key]),
  }));
}

/** The query methods the mapping uses: a Supabase query on the view, or a recording stub in tests. */
export interface CustomerListQuery {
  ilike(column: string, pattern: string): this;
  overlaps(column: string, value: string): this;
  contains(column: string, value: string[]): this;
  eq(column: string, value: boolean): this;
  is(column: string, value: null): this;
  not(column: string, operator: "is" | "cs", value: string | null): this;
  gte(column: string, value: string | number): this;
  lt(column: string, value: string): this;
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): this;
}

/**
 * A Postgres text-array literal, every element quoted, for `overlaps`.
 * PostgREST hands `ov.{…}` to Postgres as it is, so an unquoted tag holding a
 * brace, a quote or a backslash would make a malformed literal (a 500).
 */
export function pgTextArray(values: readonly string[]): string {
  return `{${values.map((v) => `"${v.replace(/["\\]/g, (ch) => `\\${ch}`)}"`).join(",")}}`;
}

/**
 * `now` less `months` calendar months, the way Postgres's
 * `now() - interval 'N months'` counts: the day is kept, or clamped to the
 * last day of a shorter month (31 March less one month is 28 February).
 */
export function monthsBefore(now: Date, months: number): Date {
  const d = new Date(now);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/**
 * Applies the filters and the sort to a query on `admin_customer_overview`.
 * Paging is the caller's (`range`). Pure: it only calls the query's methods,
 * and *Last order* counts back from `now`.
 */
export function applyCustomerFilters<Q extends CustomerListQuery>(
  query: Q,
  filters: CustomerFilters,
  { now = new Date() }: { now?: Date } = {},
): Q {
  let q = query;

  // One escaped ilike on one column: `Tan, Mei`, `(test)` and `a%b` are text,
  // never filter syntax or wildcards (ADR 0027 (d)).
  if (filters.search) q = q.ilike("search_text", `%${escapeLikePattern(filters.search)}%`);
  if (filters.tags.length) q = q.overlaps("tags", pgTextArray(filters.tags));

  if (filters.account !== "all") q = q.eq("has_account", filters.account === "signed-up");
  if (filters.source !== "all") q = q.eq("from_shopify", filters.source === "shopify");

  if (filters.google === "linked") q = q.contains("account_providers", ["google"]);
  if (filters.google === "not-linked") q = q.not("account_providers", "cs", "{google}");

  if (filters.mobile === "on-file") q = q.eq("phone_valid", true);
  if (filters.mobile === "missing") q = q.eq("has_phone", false);
  if (filters.mobile === "invalid") q = q.eq("has_phone", true).eq("phone_valid", false);

  if (filters.bought.length) q = q.overlaps("bought", pgTextArray(filters.bought));
  if (filters.last_order) {
    const cutoff = monthsBefore(now, filters.last_order.months).toISOString();
    q = filters.last_order.when === "within" ? q.gte("last_paid_at", cutoff) : q.lt("last_paid_at", cutoff);
  }
  if (filters.readjusted === "ever") q = q.not("last_readjusted_at", "is", null);
  if (filters.readjusted === "never") q = q.is("last_readjusted_at", null);
  if (filters.min_spend != null) q = q.gte("total_spent", filters.min_spend);

  switch (filters.sort) {
    case "name-asc":
      return q.order("first_name", { ascending: true }).order("last_name", { ascending: true });
    case "name-desc":
      return q.order("first_name", { ascending: false }).order("last_name", { ascending: false });
    case "oldest":
      return q.order("created_at", { ascending: true });
    case "signed-up":
      // Recently signed up first; Customers with no account last.
      return q
        .order("account_linked_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
    case "last-order":
      // Latest counted Order first; Customers who never ordered last.
      return q
        .order("last_paid_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
    case "spend":
      return q.order("total_spent", { ascending: false }).order("created_at", { ascending: false });
    case "newest":
      return q.order("created_at", { ascending: false });
  }
}
