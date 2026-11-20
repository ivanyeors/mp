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
import { escapeLikePattern } from "@/lib/supabase/like-pattern";
import type { MarketingEmailState } from "@/lib/marketing-consent/state";

export const ACCOUNT_FILTERS = ["all", "signed-up", "no-account"] as const;
export type AccountFilter = (typeof ACCOUNT_FILTERS)[number];

export const SOURCE_FILTERS = ["all", "shopify", "platform"] as const;
export type SourceFilter = (typeof SOURCE_FILTERS)[number];

export const GOOGLE_FILTERS = ["all", "linked", "not-linked"] as const;
export type GoogleFilter = (typeof GOOGLE_FILTERS)[number];

export const MOBILE_FILTERS = ["all", "on-file", "missing", "invalid"] as const;
export type MobileFilter = (typeof MOBILE_FILTERS)[number];

export const FOLLOW_UP_FILTERS = ["all", "open"] as const;
export type FollowUpFilter = (typeof FOLLOW_UP_FILTERS)[number];

export const POINTS_FILTERS = ["all", "has", "none"] as const;
export type PointsFilter = (typeof POINTS_FILTERS)[number];

export const GOOGLE_REVIEW_FILTERS = ["all", "linked", "asked", "not-asked"] as const;
export type GoogleReviewFilter = (typeof GOOGLE_REVIEW_FILTERS)[number];

export const SHOP_REVIEW_FILTERS = ["all", "yes", "no"] as const;
export type ShopReviewFilter = (typeof SHOP_REVIEW_FILTERS)[number];

export const RATING_FILTERS = ["5", "4-up", "3-down"] as const;
export type RatingFilter = (typeof RATING_FILTERS)[number];
export const CONSENT_FILTERS = ["all", "subscribed", "not-subscribed", "unsubscribed"] as const;
export type ConsentFilter = (typeof CONSENT_FILTERS)[number];

const CONSENT_STATE: Record<Exclude<ConsentFilter, "all">, MarketingEmailState> = {
  subscribed: "subscribed",
  "not-subscribed": "not_subscribed",
  unsubscribed: "unsubscribed",
};

export type StageFilter = LifecycleStage | LifecycleDetail;
export const STAGE_FILTERS: readonly StageFilter[] = LIFECYCLE_STAGES.flatMap((stage) => [
  stage,
  ...LIFECYCLE_DETAILS.filter((d) => LIFECYCLE_DETAIL_STAGE[d] === stage),
]);
const hyphens = (v: string) => v.replace(/_/g, "-");
const isMainStage = (v: StageFilter): v is LifecycleStage => (LIFECYCLE_STAGES as readonly string[]).includes(v);
export function stageFilterParam(v: StageFilter): string {
  return isMainStage(v) ? hyphens(v) : `${hyphens(LIFECYCLE_DETAIL_STAGE[v])}:${hyphens(v)}`;
}
const STAGE_PARAMS = new Set(STAGE_FILTERS.map(stageFilterParam));

export function stageFilterLabel(v: StageFilter): string {
  return isMainStage(v)
    ? LIFECYCLE_STAGE_LABEL[v]
    : `${LIFECYCLE_STAGE_LABEL[LIFECYCLE_DETAIL_STAGE[v]]} · ${LIFECYCLE_DETAIL_LABEL[v]}`;
}

export function normalizeStageFilter(values: readonly StageFilter[]): StageFilter[] {
  return STAGE_FILTERS.filter(
    (v) => values.includes(v) && (isMainStage(v) || !values.includes(LIFECYCLE_DETAIL_STAGE[v])),
  );
}

export const BOUGHT_FILTERS = PURCHASE_CLASSES;
export type BoughtFilter = PurchaseClass;

export const NOT_BOUGHT_FILTERS = PURCHASE_CLASSES;

export { PILLOW_SIZES, type PillowSize };

export interface DeliveredFilter {
  when: "within" | "over";
  days: number;
}
export const DELIVERED_DAYS_MAX = 730;
const DAY_MS = 86_400_000;

export const READJUSTED_FILTERS = ["ever", "never"] as const;
export type ReadjustedFilter = (typeof READJUSTED_FILTERS)[number];

export interface LastOrderFilter {
  when: "within" | "over";
  months: number;
}
export const LAST_ORDER_MONTHS_MAX = 120;

export const SHIPS_TO_FILTERS = ["sg", "not-sg", "unknown"] as const;
export type ShipsToFilter = (typeof SHIPS_TO_FILTERS)[number];

export const SHIPS_TO_LABELS: Record<ShipsToFilter, string> = {
  sg: "Ships to Singapore",
  "not-sg": "Ships outside Singapore",
  unknown: "Ships to an unknown country",
};

export const LANGUAGE_FILTERS = ["en", "zh-cn"] as const;
export type LanguageFilter = (typeof LANGUAGE_FILTERS)[number];
const LANGUAGE_LOCALE: Record<LanguageFilter, "en-US" | "zh-CN"> = { en: "en-US", "zh-cn": "zh-CN" };

export const LANGUAGE_LABELS: Record<LanguageFilter, string> = {
  en: "English",
  "zh-cn": "Chinese",
};

export const CAMPAIGN_FILTER_STATES = ["sent", "not-sent", "clicked", "not-clicked"] as const;
export type CampaignFilterState = (typeof CAMPAIGN_FILTER_STATES)[number];
export interface CampaignFilter {
  id: string;
  state: CampaignFilterState;
}

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

export type EmailedFilter = { when: "within" | "over"; days: number } | { when: "never" };
export const EMAILED_DAYS_MAX = 730;

export const ENGAGEMENT_FILTERS = ["engaged", "unengaged"] as const;
export type EngagementFilter = (typeof ENGAGEMENT_FILTERS)[number];
export const ENGAGEMENT_LABELS: Record<EngagementFilter, string> = {
  engaged: "Engaged",
  unengaged: "Unengaged",
};

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
  account: AccountFilter;
  source: SourceFilter;
  google: GoogleFilter;
  mobile: MobileFilter;
  points: PointsFilter;
  followups: FollowUpFilter;
  consent: ConsentFilter;
  stage: StageFilter[];
  bought: BoughtFilter[];
  not_bought: BoughtFilter[];
  size: PillowSize[];
  last_order: LastOrderFilter | null;
  delivered: DeliveredFilter | null;
  readjusted: ReadjustedFilter | null;
  min_spend: number | null;
  ships_to: ShipsToFilter | null;
  language: LanguageFilter | null;
  campaign: CampaignFilter | null;
  emailed: EmailedFilter | null;
  engagement: EngagementFilter | null;
  google_review: GoogleReviewFilter;
  shop_review: ShopReviewFilter;
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
  campaign: null,
  emailed: null,
  engagement: null,
  google_review: "all",
  shop_review: "all",
  rating: null,
  sort: "newest",
  page: 1,
  limit: 20,
};

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
  stage: commaList
    .pipe(z.array(z.string().refine((v) => STAGE_PARAMS.has(v))))
    .transform((v) => normalizeStageFilter(STAGE_FILTERS.filter((s) => v.includes(stageFilterParam(s))))),
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
  min_spend: z
    .string()
    .regex(/^\d{1,7}(\.\d{1,2})?$/)
    .transform(Number)
    .pipe(z.number().positive()),
  ships_to: z.enum(SHIPS_TO_FILTERS),
  language: z.enum(LANGUAGE_FILTERS),
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
  engagement: z.enum(ENGAGEMENT_FILTERS),
  google_review: z.enum(GOOGLE_REVIEW_FILTERS),
  shop_review: z.enum(SHOP_REVIEW_FILTERS),
  rating: z.enum(RATING_FILTERS),
  sort: z.enum(CUSTOMER_SORTS),
  page: z.coerce.number().int().min(1),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .transform((v) => Math.min(v, CUSTOMER_PAGE_LIMIT_MAX)),
} satisfies { [K in keyof CustomerFilters]: z.ZodType<CustomerFilters[K]> };

export const customerFiltersSchema = z.object(PARAM_SCHEMAS).partial();

type FilterKey = keyof typeof PARAM_SCHEMAS;
const FILTER_KEYS = Object.keys(PARAM_SCHEMAS) as FilterKey[];

export type CustomerFilterParam = FilterKey;

export const CUSTOMER_FILTER_PARAMS: readonly FilterKey[] = FILTER_KEYS;

const VIEW_KEYS = ["sort", "page", "limit"] as const satisfies readonly FilterKey[];
export type CustomerFilterKey = Exclude<FilterKey, (typeof VIEW_KEYS)[number]>;

export const CUSTOMER_FILTER_KEYS = FILTER_KEYS.filter(
  (k): k is CustomerFilterKey => !(VIEW_KEYS as readonly string[]).includes(k),
);

export type CustomerListFilters = Omit<CustomerFilters, "page" | "limit">;

type ChosenFilters = Pick<CustomerFilters, CustomerFilterKey>;

export interface ParsedCustomerFilters {
  filters: CustomerFilters;
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

export function searchParamsFromRecord(record: Record<string, string | string[] | undefined>): URLSearchParams {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(record)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first != null) out.set(key, first);
  }
  return out;
}

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
  if (f.campaign) out.set("campaign", `${f.campaign.id}:${f.campaign.state}`);
  if (f.emailed) out.set("emailed", emailedParam(f.emailed));
  if (f.engagement) out.set("engagement", f.engagement);
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

export function emailedParam(v: EmailedFilter): string {
  return v.when === "never" ? "never" : `${v.when}:${v.days}`;
}

export function isCustomerFilterActive(filters: ChosenFilters, key: CustomerFilterKey): boolean {
  const value = filters[key];
  return Array.isArray(value) ? value.length > 0 : value !== DEFAULT_CUSTOMER_FILTERS[key];
}

export function clearCustomerFilter<F extends ChosenFilters>(filters: F, key: CustomerFilterKey): F {
  return { ...filters, [key]: DEFAULT_CUSTOMER_FILTERS[key] };
}

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

export const POINTS_LABELS: Record<Exclude<PointsFilter, "all">, string> = {
  has: "Has points",
  none: "No points",
};

export const CONSENT_LABELS: Record<ConsentFilter, string> = {
  all: "any consent",
  subscribed: "subscribed",
  "not-subscribed": "not subscribed",
  unsubscribed: "unsubscribed",
};

const spend = new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" });

export interface CustomerFilterLabelContext {
  campaignNames?: ReadonlyMap<string, string>;
}

function campaignName(id: string, ctx: CustomerFilterLabelContext): string {
  const name = ctx.campaignNames?.get(id);
  return name ? `“${name}”` : "a campaign";
}

export function emailedLabel(v: EmailedFilter): string {
  if (v.when === "never") return "Never emailed";
  return v.when === "within" ? `Emailed within ${daysLabel(v.days)}` : `Not emailed in ${daysLabel(v.days)}`;
}

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
  campaign: (v, ctx) => campaignFilterLabel(v.state, campaignName(v.id, ctx)),
  emailed: (v) => emailedLabel(v),
  engagement: (v) => ENGAGEMENT_LABELS[v],
  google_review: (v) => GOOGLE_REVIEW_LABELS[v as Exclude<GoogleReviewFilter, "all">],
  shop_review: (v) => (v === "yes" ? "Left a shop review" : "No shop review"),
  rating: (v) => RATING_LABELS[v],
};

export function daysLabel(days: number): string {
  return days === 1 ? "a day" : `${days} days`;
}

function monthsLabel(months: number): string {
  if (months % 12 === 0) return months === 12 ? "a year" : `${months / 12} years`;
  return months === 1 ? "a month" : `${months} months`;
}

export function describeCustomerFilters(
  filters: ChosenFilters,
  ctx: CustomerFilterLabelContext = {},
): { key: CustomerFilterKey; label: string }[] {
  return CUSTOMER_FILTER_KEYS.filter((key) => isCustomerFilterActive(filters, key)).map((key) => ({
    key,
    label: (FILTER_LABELS[key] as (v: unknown, c: CustomerFilterLabelContext) => string)(filters[key], ctx),
  }));
}

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
  lte(column: string, value: number): this;
  order(column: string, options: { ascending: boolean; nullsFirst?: boolean }): this;
}

export function pgTextArray(values: readonly string[]): string {
  return `{${values.map((v) => `"${v.replace(/["\\]/g, (ch) => `\\${ch}`)}"`).join(",")}}`;
}

export { monthsBefore };

export function applyCustomerFilters<Q extends CustomerListQuery>(
  query: Q,
  filters: CustomerFilters,
  { now = new Date(), order = true }: { now?: Date; order?: boolean } = {},
): Q {
  let q = query;

  if (filters.search) q = q.ilike("search_text", `%${escapeLikePattern(filters.search)}%`);
  if (filters.tags.length) q = q.overlaps("tags", pgTextArray(filters.tags));

  if (filters.account !== "all") q = q.eq("has_account", filters.account === "signed-up");
  if (filters.source !== "all") q = q.eq("from_shopify", filters.source === "shopify");
  if (filters.points === "has") q = q.gt("points_available", 0);
  if (filters.points === "none") q = q.lte("points_available", 0);

  if (filters.google === "linked") q = q.contains("account_providers", ["google"]);
  if (filters.google === "not-linked") q = q.not("account_providers", "cs", "{google}");

  if (filters.mobile === "on-file") q = q.eq("phone_valid", true);
  if (filters.mobile === "missing") q = q.eq("has_phone", false);
  if (filters.mobile === "invalid") q = q.eq("has_phone", true).eq("phone_valid", false);

  if (filters.followups === "open") q = q.gt("open_followups", 0);
  if (filters.consent !== "all") q = q.eq("marketing_email", CONSENT_STATE[filters.consent]);
  if (filters.stage.length) {
    q = filters.stage.every(isMainStage)
      ? q.in("lifecycle_stage", filters.stage)
      : q.overlaps("lifecycle_statuses", pgTextArray(filters.stage));
  }

  if (filters.bought.length) q = q.overlaps("bought", pgTextArray(filters.bought));
  if (filters.not_bought.length) q = q.not("bought", "ov", pgTextArray(filters.not_bought));
  if (filters.size.length) q = q.overlaps("pillow_sizes", pgTextArray(filters.size));
  if (filters.last_order) {
    const cutoff = monthsBefore(now, filters.last_order.months).toISOString();
    q = filters.last_order.when === "within" ? q.gte("last_purchase_at", cutoff) : q.lt("last_purchase_at", cutoff);
  }
  if (filters.delivered) {
    const cutoff = new Date(now.getTime() - filters.delivered.days * DAY_MS).toISOString();
    q = filters.delivered.when === "within" ? q.gte("last_delivered_at", cutoff) : q.lt("last_delivered_at", cutoff);
  }
  if (filters.readjusted === "ever") q = q.not("last_readjusted_at", "is", null);
  if (filters.readjusted === "never") q = q.is("last_readjusted_at", null);
  if (filters.min_spend != null) q = q.gte("total_spent", filters.min_spend);

  if (filters.ships_to === "sg") q = q.eq("ship_country", "SG");
  if (filters.ships_to === "not-sg") q = q.neq("ship_country", "SG");
  if (filters.ships_to === "unknown") q = q.is("ship_country", null);
  if (filters.language) q = q.eq("locale", LANGUAGE_LOCALE[filters.language]);
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
      q = e.when === "within" ? q.gte("last_campaign_sent_at", cutoff) : q.lt("last_emailed_at", cutoff);
    }
  }
  if (filters.engagement) q = q.eq("unengaged", filters.engagement === "unengaged");

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
      return q
        .order("account_linked_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
    case "last-order":
      return q
        .order("last_purchase_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
    case "spend":
      return q.order("total_spent", { ascending: false }).order("created_at", { ascending: false });
    case "newest":
      return q.order("created_at", { ascending: false });
  }
}
