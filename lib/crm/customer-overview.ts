import type { LifecycleDetail, LifecycleStage } from "@/lib/crm/lifecycle-stage";
import type { MarketingEmailState } from "@/lib/marketing-consent/state";

export const CUSTOMER_OVERVIEW_COLUMNS = [
  "id",
  "email",
  "first_name",
  "last_name",
  "phone",
  "tags",
  "total_orders",
  "total_spent",
  "created_at",
  "has_account",
  "account_linked_at",
  "account_last_seen_at",
  "from_shopify",
  "created_by_import",
  "imported_at",
  "claimed_at",
  "shopify_orders_count",
  "shopify_amount_spent",
  "account_providers",
  "has_phone",
  "phone_valid",
  "claim_link_first_clicked_at",
  "points_available",
  "claim_bonus_at",
  "open_followups",
  "paid_orders",
  "first_paid_at",
  "last_paid_at",
  "bought",
  "last_readjusted_at",
  "search_text",
  "marketing_email",
  "marketing_email_updated_at",
  "review_requested_at",
  "review_link_clicked_at",
  "google_review_rating",
  "google_reviewed_at",
  "shop_reviews_count",
  "shop_review_avg_rating",
  "review_rating",
  "last_campaign_sent_at",
  "purchases",
  "last_purchase_at",
  "lifecycle_stage",
  "lifecycle_detail",
  "lifecycle_undated",
  "attended_bookings",
  "pillow_sizes",
  "last_delivered_at",
  "lifecycle_statuses",
  "ship_country",
  "locale",
  "campaigns_sent",
  "campaigns_clicked",
  "last_emailed_at",
  "unengaged",
  "last_purchase_dated_by_fitting",
] as const;

export type CustomerOverviewColumn = (typeof CUSTOMER_OVERVIEW_COLUMNS)[number];

export const CUSTOMER_OVERVIEW_SELECT = CUSTOMER_OVERVIEW_COLUMNS.join(", ");

export const PURCHASE_CLASSES = ["premium", "basic", "mbolster", "accessory"] as const;
export type PurchaseClass = (typeof PURCHASE_CLASSES)[number];

export const PILLOW_SIZES = ["XS", "S", "M", "L", "XL"] as const;
export type PillowSize = (typeof PILLOW_SIZES)[number];

export interface CustomerOverviewRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  tags: string[];
  total_orders: number;
  total_spent: number;
  created_at: string;
  has_account: boolean;
  account_linked_at: string | null;
  account_last_seen_at: string | null;
  from_shopify: boolean;
  created_by_import: boolean | null;
  imported_at: string | null;
  claimed_at: string | null;
  shopify_orders_count: number | null;
  shopify_amount_spent: number | null;
  account_providers: string[];
  has_phone: boolean;
  phone_valid: boolean;
  claim_link_first_clicked_at: string | null;
  points_available: number;
  claim_bonus_at: string | null;
  open_followups: number;
  paid_orders: number;
  first_paid_at: string | null;
  last_paid_at: string | null;
  bought: PurchaseClass[];
  last_readjusted_at: string | null;
  search_text: string;
  marketing_email: MarketingEmailState;
  marketing_email_updated_at: string | null;
  review_requested_at: string | null;
  review_link_clicked_at: string | null;
  google_review_rating: number | null;
  google_reviewed_at: string | null;
  shop_reviews_count: number;
  shop_review_avg_rating: number | null;
  review_rating: number | null;
  last_campaign_sent_at: string | null;
  purchases: number;
  last_purchase_at: string | null;
  lifecycle_stage: LifecycleStage;
  lifecycle_detail: LifecycleDetail | null;
  lifecycle_undated: boolean;
  attended_bookings: number;
  pillow_sizes: PillowSize[];
  last_delivered_at: string | null;
  lifecycle_statuses: (LifecycleStage | LifecycleDetail)[];
  ship_country: string | null;
  locale: "en-US" | "zh-CN";
  campaigns_sent: string[];
  campaigns_clicked: string[];
  last_emailed_at: string;
  unengaged: boolean;
  last_purchase_dated_by_fitting: boolean;
}

export function customerDisplayName(row: Pick<CustomerOverviewRow, "first_name" | "last_name">): string | null {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
  return name || null;
}
