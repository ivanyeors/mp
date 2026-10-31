import { z } from "zod";
import { PILLOW_SIZES, PURCHASE_CLASSES, type PillowSize, type PurchaseClass } from "@/lib/crm/customer-overview";
import {
  LIFECYCLE_DETAILS,
  LIFECYCLE_DETAIL_LABEL,
  LIFECYCLE_DETAIL_STAGE,
  LIFECYCLE_STAGES,
  LIFECYCLE_STAGE_LABEL,
  type LifecycleDetail,
  type LifecycleStage,
} from "@/lib/crm/lifecycle-stage";
import { monthsBefore } from "@/lib/crm/months";
import { sgDate } from "@/lib/analytics/sg-calendar";
import { escapeLikePattern } from "@/lib/supabase/like-pattern";
import type { MarketingEmailState } from "@/lib/marketing-consent/state";

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
 * CRM slice 12 adds reviews: the Google review (linked, asked but not
 * linked, not asked), Shop reviews, and the rating, so a Segment such as
 * *"reviewed us 5★ on Google"* is one link. Review data may choose any CRM
 * list except who gets a Review request (README, sixth hazard): that job never
 * reads these filters or their columns.
 *
 * PRD-campaign-audiences slice 04 adds *Didn't buy*, *Pillow size*,
 * *Delivered* and the Stage's sub-statuses, so the retention loop's Playbook
 * audiences are links too. None of them reaches the Review request job either.
 *
 * Slice 05 adds the reach filters: *Ships to*, *Language*, *Points expire
 * within*, *Campaign* (got it, didn't, clicked, didn't click) and *Last
 * emailed*, so *At risk · Ships to Singapore · Not emailed in 30 days* is a
 * link too.
 *
 * Each parameter is read on its own: an unknown value (`bought=foo`) is
 * dropped and named in `ignored`, never passed to the query.
 *
 * No typed text reaches a PostgREST `.or()` (ADR 0028 (d)): search is one
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

/** *Has an open follow-up* (CRM slice 06): the overview's `open_followups` above 0. */
export const FOLLOW_UP_FILTERS = ["all", "open"] as const;
export type FollowUpFilter = (typeof FOLLOW_UP_FILTERS)[number];

/**
 * **Points** (PRD-loyalty-points slice 06): *Has points* is an available
 * balance above 0 (`points_available`, the sum of the Points ledger); *No
 * points* is none. Pending points are not a balance (CONTEXT.md).
 */
export const POINTS_FILTERS = ["all", "has", "none"] as const;
export type PointsFilter = (typeof POINTS_FILTERS)[number];

/**
 * The Google review (CRM slice 12), each Customer in exactly one: a **Linked
 * Google review** (`linked`); asked, with none linked (`asked`); neither
 * (`not-asked`). Linking needs a Staff action, so *asked* also holds people
 * who reviewed and are not matched yet.
 */
export const GOOGLE_REVIEW_FILTERS = ["all", "linked", "asked", "not-asked"] as const;
export type GoogleReviewFilter = (typeof GOOGLE_REVIEW_FILTERS)[number];

/** Left a **Shop review** or not (`shop_reviews_count`). */
export const SHOP_REVIEW_FILTERS = ["all", "yes", "no"] as const;
export type ShopReviewFilter = (typeof SHOP_REVIEW_FILTERS)[number];

/**
 * The rating the Review column shows (`review_rating`): the linked Google
 * review's stars, else the shop average rounded. With *Google review: linked*
 * it is the Google rating alone.
 */
export const RATING_FILTERS = ["5", "4-up", "3-down"] as const;
export type RatingFilter = (typeof RATING_FILTERS)[number];
/** *Email consent* (migration slice 07): the Customer's **Marketing consent**. */
export const CONSENT_FILTERS = ["all", "subscribed", "not-subscribed", "unsubscribed"] as const;
export type ConsentFilter = (typeof CONSENT_FILTERS)[number];

const CONSENT_STATE: Record<Exclude<ConsentFilter, "all">, MarketingEmailState> = {
  subscribed: "subscribed",
  "not-subscribed": "not_subscribed",
  unsubscribed: "unsubscribed",
};

/**
 * *Stage* (PRD-crm-retention-loop slice 03): any of these **Lifecycle
 * stages**, the overview's `lifecycle_stage`. The URL spells them with
 * hyphens (`stage=at-risk,lost`), as every other filter value.
 *
 * Slice 04 (PRD-campaign-audiences) adds the sub-statuses beside them, each
 * written after its stage (`stage=new:awaiting-delivery,at-risk:lapsed`), as
 * the overview's `lifecycle_detail` names them. A sub-status names one stage,
 * so one beside its own stage is dropped: the stage already holds it. Held in
 * funnel order, each stage followed by its sub-statuses.
 */
export type StageFilter = LifecycleStage | LifecycleDetail;
export const STAGE_FILTERS: readonly StageFilter[] = LIFECYCLE_STAGES.flatMap((stage) => [
  stage,
  ...LIFECYCLE_DETAILS.filter((d) => LIFECYCLE_DETAIL_STAGE[d] === stage),
]);
const hyphens = (v: string) => v.replace(/_/g, "-");
const isMainStage = (v: StageFilter): v is LifecycleStage => (LIFECYCLE_STAGES as readonly string[]).includes(v);
/** A Stage filter value as the URL writes it: `at-risk`, `at-risk:lapsed`. */
export function stageFilterParam(v: StageFilter): string {
  return isMainStage(v) ? hyphens(v) : `${hyphens(LIFECYCLE_DETAIL_STAGE[v])}:${hyphens(v)}`;
}
const STAGE_PARAMS = new Set(STAGE_FILTERS.map(stageFilterParam));

/** How a Stage filter value reads: *At risk*, *At risk · Lapsed*. */
export function stageFilterLabel(v: StageFilter): string {
  return isMainStage(v)
    ? LIFECYCLE_STAGE_LABEL[v]
    : `${LIFECYCLE_STAGE_LABEL[LIFECYCLE_DETAIL_STAGE[v]]} · ${LIFECYCLE_DETAIL_LABEL[v]}`;
}

/**
 * The Stage values as one canonical list: funnel order, once each, and no
 * sub-status beside its own stage.
 */
export function normalizeStageFilter(values: readonly StageFilter[]): StageFilter[] {
  return STAGE_FILTERS.filter(
    (v) => values.includes(v) && (isMainStage(v) || !values.includes(LIFECYCLE_DETAIL_STAGE[v])),
  );
}

/** *Bought*: any of these, from the overview's `bought` (CRM slice 04). */
export const BOUGHT_FILTERS = PURCHASE_CLASSES;
export type BoughtFilter = PurchaseClass;

/**
 * *Didn't buy* (PRD-campaign-audiences slice 04): none of these on any counted
 * Order. The complement of *Bought*, from the same `bought` column, so
 * `bought=premium&not_bought=mbolster` is one query.
 */
export const NOT_BOUGHT_FILTERS = PURCHASE_CLASSES;

/**
 * *Pillow size* (slice 04): owns a pillow of any of these sizes, from the
 * overview's `pillow_sizes`. The URL writes them lower-case (`size=m,l`).
 */
export { PILLOW_SIZES, type PillowSize };

/**
 * *Delivered* (slice 04): the latest purchase was delivered within the last N
 * days (`within:14`), or more than N days ago (`over:30`), from the overview's
 * `last_delivered_at`. Days, because Playbooks are timed in days. A Customer
 * whose latest purchase is still on its way, or with no purchase here,
 * matches neither.
 */
export interface DeliveredFilter {
  when: "within" | "over";
  days: number;
}
export const DELIVERED_DAYS_MAX = 730;
const DAY_MS = 86_400_000;

/** *Re-adjusted*: an attended **Re-adjustment booking**, ever or never. */
export const READJUSTED_FILTERS = ["ever", "never"] as const;
export type ReadjustedFilter = (typeof READJUSTED_FILTERS)[number];

/**
 * *Last order*: the latest **purchase** (a counted Order with a goods line,
 * `last_purchase_at`; PRD-crm-retention-loop slice 03) was paid within the
 * last N months (`within:6`), or more than N months ago (`over:12`). A
 * re-adjustment fee is not a purchase. A Customer with no purchase here, a
 * Shopify-only buyer included, matches neither.
 */
export interface LastOrderFilter {
  when: "within" | "over";
  months: number;
}
export const LAST_ORDER_MONTHS_MAX = 120;

/**
 * *Ships to* (PRD-campaign-audiences slice 05), from the overview's
 * `ship_country`: the latest counted Order's shipping country, else the
 * default address's. *Unknown* is its own value, never Singapore: a
 * Shopify-era buyer with no Order here and no address is one.
 */
export const SHIPS_TO_FILTERS = ["sg", "not-sg", "unknown"] as const;
export type ShipsToFilter = (typeof SHIPS_TO_FILTERS)[number];

export const SHIPS_TO_LABELS: Record<ShipsToFilter, string> = {
  sg: "Ships to Singapore",
  "not-sg": "Ships outside Singapore",
  unknown: "Ships to an unknown country",
};

/** *Language* (slice 05): the language they read the site and its emails in, `customers.locale`. */
export const LANGUAGE_FILTERS = ["en", "zh-cn"] as const;
export type LanguageFilter = (typeof LANGUAGE_FILTERS)[number];
const LANGUAGE_LOCALE: Record<LanguageFilter, "en-US" | "zh-CN"> = { en: "en-US", "zh-cn": "zh-CN" };

export const LANGUAGE_LABELS: Record<LanguageFilter, string> = {
  en: "English",
  "zh-cn": "Chinese",
};

/**
 * *Points expire within* (slice 05): an available balance whose last day
 * (`points_expire_on`, as the Profile shows it) falls within N months of
 * today in Singapore. A date already passed is in: those points expire on the
 * daily job's next run. Nobody matches while points are off.
 */
export interface PointsExpireFilter {
  months: number;
}
export const POINTS_EXPIRE_MONTHS_MAX = 24;

/**
 * *Campaign* (slice 05): what one campaign did with them, from the overview's
 * `campaigns_sent` and `campaigns_clicked`. *Got it* is a send the provider
 * accepted, as the campaign's *Sent* counts it; *didn't click* is got it and
 * never clicked; *didn't get it* includes everyone it never reached.
 */
export const CAMPAIGN_FILTER_STATES = ["sent", "not-sent", "clicked", "not-clicked"] as const;
export type CampaignFilterState = (typeof CAMPAIGN_FILTER_STATES)[number];
export interface CampaignFilter {
  /** The campaign's id, lower-case. */
  id: string;
  state: CampaignFilterState;
}

/** How a *Campaign* filter reads, for a campaign named `name`. */
export function campaignFilterLabel(state: CampaignFilterState, name: string): string {
  switch (state) {
    case "sent":
      return `Got ${name}`;
    case "not-sent":
      return `Didn't get ${name}`;
    case "clicked":
      return `Clicked ${name}`;
    case "not-clicked":
      return `Got ${name}, didn't click`;
  }
}

/**
 * *Last emailed* (slice 05): the latest campaign email the provider accepted
 * for them. *Within N days*; *not in the last N days*, which keeps everyone
 * never emailed; or *never*. Order, aftercare and points emails don't count.
 */
export type EmailedFilter = { when: "within" | "over"; days: number } | { when: "never" };
export const EMAILED_DAYS_MAX = 730;

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
  /** An available Points balance or none (`points_available`). */
  points: PointsFilter;
  /** `open`: only Customers with a Follow-up not done yet. */
  followups: FollowUpFilter;
  /** *Email consent*: `marketing_email` on the overview. */
  consent: ConsentFilter;
  /** In any of these Lifecycle stages or sub-statuses; empty for no filter. */
  stage: StageFilter[];
  /** Bought any of these on a counted Order; empty for no filter. */
  bought: BoughtFilter[];
  /** Bought none of these on a counted Order; empty for no filter. */
  not_bought: BoughtFilter[];
  /** Owns a pillow of any of these sizes; empty for no filter. */
  size: PillowSize[];
  last_order: LastOrderFilter | null;
  /** Days since the latest purchase was delivered; null for no filter. */
  delivered: DeliveredFilter | null;
  readjusted: ReadjustedFilter | null;
  /** `total_spent` (platform Orders) at least this; null for no filter. */
  min_spend: number | null;
  /** Where they are (`ship_country`); null for no filter. */
  ships_to: ShipsToFilter | null;
  /** The language they read (`locale`); null for no filter. */
  language: LanguageFilter | null;
  /** Their points expire within N months; null for no filter. */
  points_expire: PointsExpireFilter | null;
  /** What one campaign did with them; null for no filter. */
  campaign: CampaignFilter | null;
  /** When a campaign last reached them; null for no filter. */
  emailed: EmailedFilter | null;
  /** The Google review (CRM slice 12). */
  google_review: GoogleReviewFilter;
  /** Left a Shop review. */
  shop_review: ShopReviewFilter;
  /** The review rating; null for no filter. */
  rating: RatingFilter | null;
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
  points: "all",
  followups: "all",
  consent: "all",
  stage: [],
  bought: [],
  not_bought: [],
  size: [],
  last_order: null,
  delivered: null,
  readjusted: null,
  min_spend: null,
  ships_to: null,
  language: null,
  points_expire: null,
  campaign: null,
  emailed: null,
  google_review: "all",
  shop_review: "all",
  rating: null,
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
  points: z.enum(POINTS_FILTERS),
  followups: z.enum(FOLLOW_UP_FILTERS),
  consent: z.enum(CONSENT_FILTERS),
  // As `bought`: an unknown value drops the parameter; kept in funnel order, once each.
  stage: commaList
    .pipe(z.array(z.string().refine((v) => STAGE_PARAMS.has(v))))
    .transform((v) => normalizeStageFilter(STAGE_FILTERS.filter((s) => v.includes(stageFilterParam(s))))),
  // Any unknown value drops the whole parameter. Kept in BOUGHT_FILTERS order,
  // once each, so the same set always writes the same URL.
  bought: commaList
    .pipe(z.array(z.enum(BOUGHT_FILTERS)))
    .transform((v) => BOUGHT_FILTERS.filter((c) => v.includes(c))),
  not_bought: commaList
    .pipe(z.array(z.enum(NOT_BOUGHT_FILTERS)))
    .transform((v) => NOT_BOUGHT_FILTERS.filter((c) => v.includes(c))),
  size: commaList
    .pipe(z.array(z.enum(["xs", "s", "m", "l", "xl"])))
    .transform((v) => PILLOW_SIZES.filter((size) => v.includes(size.toLowerCase() as Lowercase<PillowSize>))),
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
  delivered: z
    .string()
    .regex(/^(within|over):\d{1,3}$/)
    .transform((v) => {
      const [when, days] = v.split(":");
      return { when: when as DeliveredFilter["when"], days: Number(days) };
    })
    .pipe(
      z.object({
        when: z.enum(["within", "over"]),
        days: z.number().int().min(1).max(DELIVERED_DAYS_MAX),
      }),
    ),
  readjusted: z.enum(READJUSTED_FILTERS),
  // A plain amount, at most two decimals: never an exponent or a sign.
  min_spend: z
    .string()
    .regex(/^\d{1,7}(\.\d{1,2})?$/)
    .transform(Number)
    .pipe(z.number().positive()),
  ships_to: z.enum(SHIPS_TO_FILTERS),
  language: z.enum(LANGUAGE_FILTERS),
  points_expire: z
    .string()
    .regex(/^within:\d{1,2}$/)
    .transform((v) => ({ months: Number(v.split(":")[1]) }))
    .pipe(z.object({ months: z.number().int().min(1).max(POINTS_EXPIRE_MONTHS_MAX) })),
  // `<campaign id>:<state>`; the id is written lower-case, so one campaign is one URL.
  campaign: z
    .string()
    .regex(/^[0-9a-fA-F-]{36}:[a-z-]+$/)
    .transform((v) => {
      const at = v.lastIndexOf(":");
      return { id: v.slice(0, at).toLowerCase(), state: v.slice(at + 1) };
    })
    .pipe(z.object({ id: z.string().uuid(), state: z.enum(CAMPAIGN_FILTER_STATES) })),
  emailed: z
    .string()
    .regex(/^((within|over):\d{1,3}|never)$/)
    .transform((v): EmailedFilter | { when: "within" | "over"; days: number } =>
      v === "never" ? { when: "never" } : { when: v.split(":")[0] as "within" | "over", days: Number(v.split(":")[1]) },
    )
    .pipe(
      z.union([
        z.object({ when: z.literal("never") }),
        z.object({ when: z.enum(["within", "over"]), days: z.number().int().min(1).max(EMAILED_DAYS_MAX) }),
      ]),
    ),
  google_review: z.enum(GOOGLE_REVIEW_FILTERS),
  shop_review: z.enum(SHOP_REVIEW_FILTERS),
  rating: z.enum(RATING_FILTERS),
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
  const filters: CustomerFilters = {
    ...DEFAULT_CUSTOMER_FILTERS,
    tags: [],
    stage: [],
    bought: [],
    not_bought: [],
    size: [],
  };
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
  if (f.points !== "all") out.set("points", f.points);
  if (f.followups !== "all") out.set("followups", f.followups);
  if (f.consent !== "all") out.set("consent", f.consent);
  if (f.stage.length) out.set("stage", f.stage.map(stageFilterParam).join(","));
  if (f.bought.length) out.set("bought", f.bought.join(","));
  if (f.not_bought.length) out.set("not_bought", f.not_bought.join(","));
  if (f.size.length) out.set("size", f.size.map((size) => size.toLowerCase()).join(","));
  if (f.last_order) out.set("last_order", `${f.last_order.when}:${f.last_order.months}`);
  if (f.delivered) out.set("delivered", `${f.delivered.when}:${f.delivered.days}`);
  if (f.readjusted) out.set("readjusted", f.readjusted);
  if (f.min_spend != null) out.set("min_spend", String(Math.round(f.min_spend * 100) / 100));
  if (f.ships_to) out.set("ships_to", f.ships_to);
  if (f.language) out.set("language", f.language);
  if (f.points_expire) out.set("points_expire", `within:${f.points_expire.months}`);
  if (f.campaign) out.set("campaign", `${f.campaign.id}:${f.campaign.state}`);
  if (f.emailed) out.set("emailed", emailedParam(f.emailed));
  if (f.google_review !== "all") out.set("google_review", f.google_review);
  if (f.shop_review !== "all") out.set("shop_review", f.shop_review);
  if (f.rating) out.set("rating", f.rating);
  if (f.sort !== DEFAULT_CUSTOMER_FILTERS.sort) out.set("sort", f.sort);
  if (paging) {
    out.set("page", String(f.page));
    out.set("limit", String(f.limit));
  }
  return out;
}

/** The *Last emailed* value as the URL writes it: `within:14`, `over:30`, `never`. */
export function emailedParam(v: EmailedFilter): string {
  return v.when === "never" ? "never" : `${v.when}:${v.days}`;
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

export const GOOGLE_REVIEW_LABELS: Record<Exclude<GoogleReviewFilter, "all">, string> = {
  linked: "Google review linked",
  asked: "Asked, no Google review linked",
  "not-asked": "Not asked, no Google review",
};

export const RATING_LABELS: Record<RatingFilter, string> = {
  "5": "Rated 5★",
  "4-up": "Rated 4★ and up",
  "3-down": "Rated 3★ and below",
};

/** How the *Points* filter's values read, in its control and its summary chip. */
export const POINTS_LABELS: Record<Exclude<PointsFilter, "all">, string> = {
  has: "Has points",
  none: "No points",
};

/** How the *Email consent* filter's values read, in its control and its summary chip. */
export const CONSENT_LABELS: Record<ConsentFilter, string> = {
  all: "any consent",
  subscribed: "subscribed",
  "not-subscribed": "not subscribed",
  unsubscribed: "unsubscribed",
};

const spend = new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" });

/**
 * What a summary label may need beyond the filters: the campaigns' names, by
 * id, for *Campaign*. A campaign not in it reads *a campaign*.
 */
export interface CustomerFilterLabelContext {
  campaignNames?: ReadonlyMap<string, string>;
}

/** *Got “November care tips”*: a campaign's name in quotes, or *a campaign* when it is not known here. */
function campaignName(id: string, ctx: CustomerFilterLabelContext): string {
  const name = ctx.campaignNames?.get(id);
  return name ? `“${name}”` : "a campaign";
}

/** How *Last emailed* reads, in its control and its summary chip. */
export function emailedLabel(v: EmailedFilter): string {
  if (v.when === "never") return "Never emailed";
  return v.when === "within" ? `Emailed within ${daysLabel(v.days)}` : `Not emailed in ${daysLabel(v.days)}`;
}

/** How each filter reads in the summary above the list. */
const FILTER_LABELS: {
  [K in CustomerFilterKey]: (value: NonNullable<CustomerFilters[K]>, ctx: CustomerFilterLabelContext) => string;
} = {
  search: (v) => `Search: “${v}”`,
  tags: (v) => `Tags: ${v.join(", ")}`,
  account: (v) => (v === "signed-up" ? "Signed up" : "No account"),
  source: (v) => (v === "shopify" ? "From Shopify" : "Platform"),
  google: (v) => (v === "linked" ? "Google linked" : "Google not linked"),
  mobile: (v) => (v === "on-file" ? "Valid mobile on file" : v === "missing" ? "Mobile missing" : "Mobile invalid"),
  points: (v) => POINTS_LABELS[v as Exclude<PointsFilter, "all">],
  followups: () => "Has an open follow-up",
  consent: (v) => `Email ${CONSENT_LABELS[v]}`,
  stage: (v) => `Stage: ${v.map(stageFilterLabel).join(" or ")}`,
  bought: (v) => `Bought ${v.map((c) => BOUGHT_LABELS[c]).join(" or ")}`,
  not_bought: (v) => `Didn't buy ${v.map((c) => BOUGHT_LABELS[c]).join(" or ")}`,
  size: (v) => `Pillow size ${v.join(" or ")}`,
  last_order: (v) =>
    v.when === "within"
      ? `Last order within ${monthsLabel(v.months)}`
      : `Last order over ${monthsLabel(v.months)} ago`,
  delivered: (v) =>
    v.when === "within" ? `Delivered within ${daysLabel(v.days)}` : `Delivered over ${daysLabel(v.days)} ago`,
  readjusted: (v) => (v === "ever" ? "Re-adjusted" : "Never re-adjusted"),
  min_spend: (v) => `Spent at least ${spend.format(v)}`,
  ships_to: (v) => SHIPS_TO_LABELS[v],
  language: (v) => `Reads ${LANGUAGE_LABELS[v]}`,
  points_expire: (v) => `Points expire within ${monthsLabel(v.months)}`,
  campaign: (v, ctx) => campaignFilterLabel(v.state, campaignName(v.id, ctx)),
  emailed: (v) => emailedLabel(v),
  google_review: (v) => GOOGLE_REVIEW_LABELS[v as Exclude<GoogleReviewFilter, "all">],
  shop_review: (v) => (v === "yes" ? "Left a shop review" : "No shop review"),
  rating: (v) => RATING_LABELS[v],
};

/** *14 days*, *a day*: the *Delivered* filter's span. */
export function daysLabel(days: number): string {
  return days === 1 ? "a day" : `${days} days`;
}

/** *3 months*, *a year*: a span in months. */
export function monthsLabel(months: number): string {
  if (months % 12 === 0) return months === 12 ? "a year" : `${months / 12} years`;
  return months === 1 ? "a month" : `${months} months`;
}

/** The active filters, each with its summary label, in URL order. */
export function describeCustomerFilters(
  filters: ChosenFilters,
  ctx: CustomerFilterLabelContext = {},
): { key: CustomerFilterKey; label: string }[] {
  return CUSTOMER_FILTER_KEYS.filter((key) => isCustomerFilterActive(filters, key)).map((key) => ({
    key,
    label: (FILTER_LABELS[key] as (v: unknown, c: CustomerFilterLabelContext) => string)(filters[key], ctx),
  }));
}

/** The query methods the mapping uses: a Supabase query on the view, or a recording stub in tests. */
export interface CustomerListQuery {
  ilike(column: string, pattern: string): this;
  overlaps(column: string, value: string): this;
  contains(column: string, value: string[]): this;
  eq(column: string, value: boolean | string | number): this;
  neq(column: string, value: string): this;
  in(column: string, values: readonly string[]): this;
  is(column: string, value: null): this;
  not(column: string, operator: "is" | "cs" | "ov", value: string | null): this;
  gt(column: string, value: string | number): this;
  gte(column: string, value: string | number): this;
  lt(column: string, value: string): this;
  lte(column: string, value: string | number): this;
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

// Lives in ./months so lib/crm/lifecycle-stage can count months without this module.
export { monthsBefore };

/**
 * Today in Singapore plus `months`, `YYYY-MM-DD`: the *Points expire within*
 * cutoff. Counted as `points_expires_on()` counts, the day kept or clamped to
 * a shorter month's last.
 */
export function sgDatePlusMonths(now: Date, months: number): string {
  const [y, m, d] = sgDate(now).split("-").map(Number) as [number, number, number];
  return monthsBefore(new Date(Date.UTC(y, m - 1, d)), -months).toISOString().slice(0, 10);
}

/**
 * Applies the filters and the sort to a query on `admin_customer_overview`.
 * Paging is the caller's (`range`). Pure: it only calls the query's methods,
 * and *Last order* and *Delivered* count back from `now`. *Stage* is the one
 * exception: the view computes `lifecycle_stage` with the database's own
 * `now()`, so `now` does not move it (PRD-crm-retention-loop slice 03).
 *
 * `order: false` applies the filters only and leaves the order to the caller:
 * a Segment's count needs none, and `resolveSegment` (lib/crm/segments.ts)
 * pages by `id` so a long run is stable (CRM slice 05).
 */
export function applyCustomerFilters<Q extends CustomerListQuery>(
  query: Q,
  filters: CustomerFilters,
  { now = new Date(), order = true }: { now?: Date; order?: boolean } = {},
): Q {
  let q = query;

  // One escaped ilike on one column: `Tan, Mei`, `(test)` and `a%b` are text,
  // never filter syntax or wildcards (ADR 0028 (d)).
  if (filters.search) q = q.ilike("search_text", `%${escapeLikePattern(filters.search)}%`);
  if (filters.tags.length) q = q.overlaps("tags", pgTextArray(filters.tags));

  if (filters.account !== "all") q = q.eq("has_account", filters.account === "signed-up");
  if (filters.source !== "all") q = q.eq("from_shopify", filters.source === "shopify");
  // The ledger never takes a balance below 0, so these two split every Customer.
  if (filters.points === "has") q = q.gt("points_available", 0);
  if (filters.points === "none") q = q.lte("points_available", 0);

  if (filters.google === "linked") q = q.contains("account_providers", ["google"]);
  if (filters.google === "not-linked") q = q.not("account_providers", "cs", "{google}");

  if (filters.mobile === "on-file") q = q.eq("phone_valid", true);
  if (filters.mobile === "missing") q = q.eq("has_phone", false);
  if (filters.mobile === "invalid") q = q.eq("has_phone", true).eq("phone_valid", false);

  if (filters.followups === "open") q = q.gt("open_followups", 0);
  if (filters.consent !== "all") q = q.eq("marketing_email", CONSENT_STATE[filters.consent]);
  // Main stages alone read the stage; with a sub-status, `lifecycle_statuses`
  // holds both names, so it is still one overlap and never an `or`.
  if (filters.stage.length) {
    q = filters.stage.every(isMainStage)
      ? q.in("lifecycle_stage", filters.stage)
      : q.overlaps("lifecycle_statuses", pgTextArray(filters.stage));
  }

  if (filters.bought.length) q = q.overlaps("bought", pgTextArray(filters.bought));
  // `bought` is never null ('{}' for nothing), so *Didn't buy* keeps a Customer who bought nothing.
  if (filters.not_bought.length) q = q.not("bought", "ov", pgTextArray(filters.not_bought));
  if (filters.size.length) q = q.overlaps("pillow_sizes", pgTextArray(filters.size));
  if (filters.last_order) {
    const cutoff = monthsBefore(now, filters.last_order.months).toISOString();
    q = filters.last_order.when === "within" ? q.gte("last_purchase_at", cutoff) : q.lt("last_purchase_at", cutoff);
  }
  if (filters.delivered) {
    // Whole days back from `now`, as the overview's 30 days to *Settled*.
    const cutoff = new Date(now.getTime() - filters.delivered.days * DAY_MS).toISOString();
    q = filters.delivered.when === "within" ? q.gte("last_delivered_at", cutoff) : q.lt("last_delivered_at", cutoff);
  }
  if (filters.readjusted === "ever") q = q.not("last_readjusted_at", "is", null);
  if (filters.readjusted === "never") q = q.is("last_readjusted_at", null);
  if (filters.min_spend != null) q = q.gte("total_spent", filters.min_spend);

  // Slice 05. A null country is never Singapore, and `<>` never lists it either.
  if (filters.ships_to === "sg") q = q.eq("ship_country", "SG");
  if (filters.ships_to === "not-sg") q = q.neq("ship_country", "SG");
  if (filters.ships_to === "unknown") q = q.is("ship_country", null);
  if (filters.language) q = q.eq("locale", LANGUAGE_LOCALE[filters.language]);
  // A null date (no balance, points off) never matches.
  if (filters.points_expire) q = q.lte("points_expire_on", sgDatePlusMonths(now, filters.points_expire.months));
  if (filters.campaign) {
    const { id, state } = filters.campaign;
    if (state === "sent" || state === "not-clicked") q = q.contains("campaigns_sent", [id]);
    if (state === "not-sent") q = q.not("campaigns_sent", "cs", pgTextArray([id]));
    if (state === "clicked") q = q.contains("campaigns_clicked", [id]);
    if (state === "not-clicked") q = q.not("campaigns_clicked", "cs", pgTextArray([id]));
  }
  if (filters.emailed) {
    const e = filters.emailed;
    if (e.when === "never") q = q.is("last_campaign_sent_at", null);
    else {
      const cutoff = new Date(now.getTime() - e.days * DAY_MS).toISOString();
      // `last_emailed_at` is '-infinity' for never, so *not in N days* keeps them.
      q = e.when === "within" ? q.gte("last_campaign_sent_at", cutoff) : q.lt("last_emailed_at", cutoff);
    }
  }

  // CRM slice 12. Each Customer is in exactly one Google review value.
  if (filters.google_review === "linked") q = q.not("google_reviewed_at", "is", null);
  if (filters.google_review === "asked") q = q.not("review_requested_at", "is", null).is("google_reviewed_at", null);
  if (filters.google_review === "not-asked") q = q.is("review_requested_at", null).is("google_reviewed_at", null);
  if (filters.shop_review === "yes") q = q.gt("shop_reviews_count", 0);
  if (filters.shop_review === "no") q = q.eq("shop_reviews_count", 0);
  if (filters.rating === "5") q = q.eq("review_rating", 5);
  if (filters.rating === "4-up") q = q.gte("review_rating", 4);
  if (filters.rating === "3-down") q = q.lte("review_rating", 3);
  if (!order) return q;

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
      // Latest purchase first; Customers with none here last.
      return q
        .order("last_purchase_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
    case "spend":
      return q.order("total_spent", { ascending: false }).order("created_at", { ascending: false });
    case "newest":
      return q.order("created_at", { ascending: false });
  }
}
