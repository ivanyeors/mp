/**
 * The Customer overview (migration slice 12; ADR 0029 (k)): the one read model
 * the Admin Panel lists Customers from, `admin_customer_overview`.
 *
 * Statuses are derived in the view from stored facts, never stored as text:
 * *Signed up* is `has_account`, a **Migrated customer** is `from_shopify`.
 * The view is server-only (no grant to anon or authenticated), so it is read
 * with the service role from a route or page that has checked `customers`.
 *
 * To add a column, a later slice appends it to the view with
 * `create or replace view` (at the end: Postgres refuses a reorder) and to
 * `CUSTOMER_OVERVIEW_COLUMNS` and `CustomerOverviewRow` below. Removing one
 * is a rebuild: `drop view` and `create view` in one migration, with the
 * views that read it (PRD-loyalty-points slice 06 did this).
 * `lib/crm/__tests__/customer-overview-view.test.ts` fails until the view and
 * this list agree.
 */

import type { LifecycleDetail, LifecycleStage } from "@/lib/crm/lifecycle-stage";
import type { MarketingEmailState } from "@/lib/marketing-consent/state";

/** Every column of `admin_customer_overview`, in the view's order. */
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

/** The `select` list for the view. */
export const CUSTOMER_OVERVIEW_SELECT = CUSTOMER_OVERVIEW_COLUMNS.join(", ");

/**
 * What a Customer has bought, as the overview's `bought` lists it (CRM slice
 * 04), in this order: a Premium or Basic Mpillow, an Mbolster, an accessory.
 * Read from `customer_purchase_lines`, the SQL twin of `classifyOrderLine`
 * (lib/crm/purchase-lines.ts).
 */
export const PURCHASE_CLASSES = ["premium", "basic", "mbolster", "accessory"] as const;
export type PurchaseClass = (typeof PURCHASE_CLASSES)[number];

/** Pillow sizes, smallest first, as `pillow_products.size` and the overview's `pillow_sizes` hold them. */
export const PILLOW_SIZES = ["XS", "S", "M", "L", "XL"] as const;
export type PillowSize = (typeof PILLOW_SIZES)[number];

/** One row of `admin_customer_overview`. */
export interface CustomerOverviewRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  /** Staff-only tags (the customer's own key is not granted them). */
  tags: string[];
  /** Platform **Orders** only; Shopify-era figures are `shopify_*`. */
  total_orders: number;
  total_spent: number;
  created_at: string;
  /** Account status: *Signed up* when true, *No account* when false. */
  has_account: boolean;
  /** When the current login was bound; null without an account. */
  account_linked_at: string | null;
  /** The last account page they opened while signed in, to the hour. */
  account_last_seen_at: string | null;
  /** A **Migrated customer**: it has a `migrated_customers` row. */
  from_shopify: boolean;
  /** Null unless `from_shopify`. False = merged into an existing Customer. */
  created_by_import: boolean | null;
  imported_at: string | null;
  /** The **Claim** (slice 05); null until then. */
  claimed_at: string | null;
  shopify_orders_count: number | null;
  shopify_amount_spent: number | null;
  /** Sign-in methods on the login, sorted (`{email,google}`); empty without an account (CRM 11). */
  account_providers: string[];
  /** A number is on file (CRM 11: *Mobile: missing* is false). */
  has_phone: boolean;
  /** It passes `isValidPhone` (CRM 11: *Mobile: on file*; with `has_phone`, *invalid* when false). */
  phone_valid: boolean;
  /** The first click of any of their **Claim links** (slice 06); null if none was opened. */
  claim_link_first_clicked_at: string | null;
  /**
   * Their available **Points** (PRD-loyalty-points slice 06): the sum of the
   * Points ledger, as `points_balance()` counts it; 0 with none. Pending
   * points are not in it.
   */
  points_available: number;
  /** When their **Claim bonus** was granted; null without one. */
  claim_bonus_at: string | null;
  /** Follow-ups not done yet (CRM slice 06); 0 when none. */
  open_followups: number;
  /**
   * Counted platform **Orders** (CRM slice 04): paid, and not pending,
   * cancelled, refunded or payment-failed. Shopify-era orders are not here.
   */
  paid_orders: number;
  /** The first and the latest counted Order's `paid_at`; null with none. */
  first_paid_at: string | null;
  last_paid_at: string | null;
  /** What they bought on counted Orders, in `PURCHASE_CLASSES` order. */
  bought: PurchaseClass[];
  /** The latest attended **Re-adjustment booking**'s `start_at`. */
  last_readjusted_at: string | null;
  /** `lower(email first last)`: the list's search reads only this. */
  search_text: string;
  /** **Marketing consent** (migration slice 07). */
  marketing_email: MarketingEmailState;
  /** When it was last set; null while `not_subscribed`. The export day for a Shopify one. */
  marketing_email_updated_at: string | null;
  /**
   * CRM slice 12: *asked on*, the earlier send of their **Review request**
   * (email or WhatsApp); null when nothing went out.
   */
  review_requested_at: string | null;
  /** The first click on their review link: a hint, never proof of a review. */
  review_link_clicked_at: string | null;
  /** Their **Linked Google review**'s stars (Staff-confirmed); null without one, or when Google gave none. */
  google_review_rating: number | null;
  /** That review's own date; set exactly when a Google review is linked. */
  google_reviewed_at: string | null;
  /** Their **Shop reviews**, whatever the moderation status; 0 when none. */
  shop_reviews_count: number;
  /** Their average shop rating, to one decimal; null with none. */
  shop_review_avg_rating: number | null;
  /** The Google rating when linked, else the shop average rounded: what the Rating filter reads. */
  review_rating: number | null;
  /**
   * The latest campaign email the provider accepted for them (migration slice
   * 08; sent, or since bounced or complained); null if the campaign never did.
   */
  last_campaign_sent_at: string | null;
  /**
   * **Purchases** (PRD-crm-retention-loop slice 03): counted Orders with a
   * goods line, so a re-adjustment fee is not one, plus the Shopify-era order
   * count.
   */
  purchases: number;
  /**
   * The latest purchase: the latest here, or a Shopify-era one dated by their
   * latest Fitting record when that is later (ADR 0042 m,
   * `last_purchase_dated_by_fitting`). Null with neither: a Shopify-only
   * buyer with no fitting has no date.
   */
  last_purchase_at: string | null;
  /** The **Lifecycle stage** (lib/crm/lifecycle-stage), as of the read. */
  lifecycle_stage: LifecycleStage;
  /**
   * The sub-status within the stage: a dated *New* Customer's delivery, why
   * they are *Loyal*, or *Lapsed* within *At risk*; null otherwise.
   */
  lifecycle_detail: LifecycleDetail | null;
  /** Placed by the Shopify-era count alone: no purchase here and no fitting to date them, so never At risk. */
  lifecycle_undated: boolean;
  /** Attended **Re-adjustment bookings**; the latest is `last_readjusted_at`. */
  attended_bookings: number;
  /**
   * The sizes of every pillow on a counted Order, XS to XL, once each
   * (PRD-campaign-audiences slice 04); empty for none.
   */
  pillow_sizes: PillowSize[];
  /** When the latest purchase was delivered; null while it is on its way, or with none here. */
  last_delivered_at: string | null;
  /** The stage and its sub-status, when it has one (`["at_risk", "lapsed"]`): the Stage filter's column. */
  lifecycle_statuses: (LifecycleStage | LifecycleDetail)[];
  /**
   * Where they are, ISO-2 (PRD-campaign-audiences slice 05): the latest
   * counted Order's shipping country, else their default address's, else the
   * address saved last. Null is *Unknown*, never Singapore.
   */
  ship_country: string | null;
  /** The language they read the site and its emails in (`customers.locale`). */
  locale: "en-US" | "zh-CN";
  /** The campaigns the provider accepted for them, as a campaign's *Sent* counts them. */
  campaigns_sent: string[];
  /** Those whose email they clicked (slice 08's counted click). */
  campaigns_clicked: string[];
  /**
   * `last_campaign_sent_at`, or `"-infinity"` for never: only the *Last
   * emailed* filter reads it, so *not emailed in 30 days* keeps the
   * never-emailed. Show `last_campaign_sent_at` instead.
   */
  last_emailed_at: string;
  /**
   * **Unengaged** (PRD-campaign-audiences slice 12, lib/crm/engagement.ts):
   * clicked none of their last 6 campaign emails, and Lapsed or a Lead for
   * over 12 months. Campaigns leave them out unless one includes them. Never
   * a stage, never consent.
   */
  unengaged: boolean;
  /**
   * `last_purchase_at` is a Shopify-era purchase dated by their latest
   * **Fitting record**, not an Order here (ADR 0042 m).
   */
  last_purchase_dated_by_fitting: boolean;
}

/** Display name, or null when the Customer has none. */
export function customerDisplayName(row: Pick<CustomerOverviewRow, "first_name" | "last_name">): string | null {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
  return name || null;
}
