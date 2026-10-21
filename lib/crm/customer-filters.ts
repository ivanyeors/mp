import { z } from "zod";
import type { MarketingEmailState } from "@/lib/marketing-consent/state";

/**
 * The Customers list's URL parameters, and how they become a query on the
 * Customer overview (`admin_customer_overview`, lib/crm/customer-overview.ts).
 *
 * One mapping for every caller: `listAdminCustomers` reads its filters through
 * here, so the RSC page and `GET /api/shop/customers` agree, and the list's
 * client writes its URL with `customerFilterParams`, so a filtered list is a
 * link (migration slice 12). CRM slice 04 adds its filters to this schema.
 * CRM slice 11 adds Contact status: Google linked or not, and the mobile on
 * file. *Email verified* is the Account filter: an account is bound by the
 * email they signed in with, so *Signed up* means exactly that.
 *
 * Each parameter is read on its own: an unknown value (`account=foo`) is
 * dropped and named in `ignored`, never passed to the query.
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

/**
 * The Welcome-back voucher (migration slice 06): *Issued, unused* is the list
 * to nudge before the vouchers expire; *Used* is who redeemed one.
 */
export const VOUCHER_FILTERS = ["all", "issued", "used"] as const;
export type VoucherFilter = (typeof VOUCHER_FILTERS)[number];

/** *Email consent* (migration slice 07): the Customer's **Marketing consent**. */
export const CONSENT_FILTERS = ["all", "subscribed", "not-subscribed", "unsubscribed"] as const;
export type ConsentFilter = (typeof CONSENT_FILTERS)[number];

const CONSENT_STATE: Record<Exclude<ConsentFilter, "all">, MarketingEmailState> = {
  subscribed: "subscribed",
  "not-subscribed": "not_subscribed",
  unsubscribed: "unsubscribed",
};

export const CUSTOMER_SORTS = ["newest", "oldest", "name-asc", "name-desc", "signed-up"] as const;
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
  /** The Welcome-back voucher's state (`welcome_voucher_state`). */
  voucher: VoucherFilter;
  /** *Email consent*: `marketing_email` on the overview. */
  consent: ConsentFilter;
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
  voucher: "all",
  consent: "all",
  sort: "newest",
  page: 1,
  limit: 20,
};

const PARAM_SCHEMAS = {
  search: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null),
  tags: z.string().transform((v) =>
    v
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  ),
  account: z.enum(ACCOUNT_FILTERS),
  source: z.enum(SOURCE_FILTERS),
  google: z.enum(GOOGLE_FILTERS),
  mobile: z.enum(MOBILE_FILTERS),
  voucher: z.enum(VOUCHER_FILTERS),
  consent: z.enum(CONSENT_FILTERS),
  sort: z.enum(CUSTOMER_SORTS),
  page: z.coerce.number().int().min(1),
  // An oversized limit is capped, as before, rather than dropped.
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .transform((v) => Math.min(v, CUSTOMER_PAGE_LIMIT_MAX)),
} satisfies { [K in keyof CustomerFilters]: z.ZodType<CustomerFilters[K]> };

type FilterKey = keyof typeof PARAM_SCHEMAS;
const FILTER_KEYS = Object.keys(PARAM_SCHEMAS) as FilterKey[];

/** Every URL key the list's filters own; any other key (`view`) is left alone. */
export const CUSTOMER_FILTER_PARAMS: readonly FilterKey[] = FILTER_KEYS;

export interface ParsedCustomerFilters {
  filters: CustomerFilters;
  /** Parameters that were present but invalid, and so not applied. */
  ignored: FilterKey[];
}

export function parseCustomerFilters(params: URLSearchParams): ParsedCustomerFilters {
  const filters: CustomerFilters = { ...DEFAULT_CUSTOMER_FILTERS, tags: [] };
  const ignored: FilterKey[] = [];
  for (const key of FILTER_KEYS) {
    const raw = params.get(key);
    if (raw == null) continue;
    const parsed = PARAM_SCHEMAS[key].safeParse(raw);
    if (parsed.success) (filters as Record<FilterKey, unknown>)[key] = parsed.data;
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
  if (f.voucher !== "all") out.set("voucher", f.voucher);
  if (f.consent !== "all") out.set("consent", f.consent);
  if (f.sort !== DEFAULT_CUSTOMER_FILTERS.sort) out.set("sort", f.sort);
  if (paging) {
    out.set("page", String(f.page));
    out.set("limit", String(f.limit));
  }
  return out;
}

/** The query methods the mapping uses: a Supabase query on the view, or a recording stub in tests. */
export interface CustomerListQuery {
  or(filters: string): this;
  overlaps(column: string, value: string[]): this;
  contains(column: string, value: string[]): this;
  not(column: string, operator: "cs", value: string): this;
  eq(column: string, value: boolean | string): this;
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): this;
}

/**
 * Applies the filters and the sort to a query on `admin_customer_overview`.
 * Paging is the caller's (`range`). Pure: it only calls the query's methods.
 */
export function applyCustomerFilters<Q extends CustomerListQuery>(query: Q, filters: CustomerFilters): Q {
  let q = query;

  // Unchanged from before the overview; CRM slice 04 replaces it with one
  // escaped `ilike` on a search column (ADR 0027 (d)).
  if (filters.search) {
    const s = filters.search;
    q = q.or(`email.ilike.%${s}%,first_name.ilike.%${s}%,last_name.ilike.%${s}%`);
  }
  if (filters.tags.length) q = q.overlaps("tags", filters.tags);

  if (filters.account !== "all") q = q.eq("has_account", filters.account === "signed-up");
  if (filters.source !== "all") q = q.eq("from_shopify", filters.source === "shopify");
  if (filters.voucher !== "all") q = q.eq("welcome_voucher_state", filters.voucher);

  if (filters.google === "linked") q = q.contains("account_providers", ["google"]);
  if (filters.google === "not-linked") q = q.not("account_providers", "cs", "{google}");

  if (filters.mobile === "on-file") q = q.eq("phone_valid", true);
  if (filters.mobile === "missing") q = q.eq("has_phone", false);
  if (filters.mobile === "invalid") q = q.eq("has_phone", true).eq("phone_valid", false);

  if (filters.consent !== "all") q = q.eq("marketing_email", CONSENT_STATE[filters.consent]);

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
    case "newest":
      return q.order("created_at", { ascending: false });
  }
}
