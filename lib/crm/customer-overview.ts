/**
 * The Customer overview (migration slice 12; ADR 0028 (k)): the one read model
 * the Admin Panel lists Customers from, `admin_customer_overview`.
 *
 * Statuses are derived in the view from stored facts, never stored as text:
 * *Signed up* is `has_account`, a **Migrated customer** is `from_shopify`.
 * The view is server-only (no grant to anon or authenticated), so it is read
 * with the service role from a route or page that has checked `customers`.
 *
 * To add a column, a later slice appends it to the view with
 * `create or replace view` (at the end: Postgres refuses a reorder) and to
 * `CUSTOMER_OVERVIEW_COLUMNS` and `CustomerOverviewRow` below.
 * `lib/crm/__tests__/customer-overview-view.test.ts` fails until the view and
 * this list agree.
 */

import type { WelcomeVoucherState } from "@/lib/customer-migration/welcome-voucher";
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
  "welcome_voucher_state",
  "open_followups",
  "paid_orders",
  "first_paid_at",
  "last_paid_at",
  "bought",
  "last_readjusted_at",
  "search_text",
  "marketing_email",
  "marketing_email_updated_at",
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
   * Their **Welcome-back voucher** (slice 06), by `welcome_voucher_state()`:
   * `none`, `issued` (unused, still usable), `used` or `expired`.
   */
  welcome_voucher_state: WelcomeVoucherState;
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
}

/** Display name, or null when the Customer has none. */
export function customerDisplayName(row: Pick<CustomerOverviewRow, "first_name" | "last_name">): string | null {
  const name = [row.first_name, row.last_name].filter(Boolean).join(" ");
  return name || null;
}
