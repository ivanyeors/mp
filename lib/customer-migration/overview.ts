import { supabaseAdmin } from "@/lib/supabase/server";
import type { WelcomeVoucherState } from "@/lib/customer-migration/welcome-voucher";
import type { DiscountType } from "@/lib/types/ecommerce";

/**
 * What the Admin Panel shows about the Shopify import (migration slice 12):
 * the Migration card on the Customers page, and the From Shopify card on a
 * Migrated customer's detail page. Both read `migrated_customers` and the
 * Import batch rows, whatever created them, with the service role; the
 * caller has checked `customers`.
 */

// ─── The Migration card ──────────────────────────────────────────────────────

/**
 * Every column of `admin_customer_migration_summary`, in the view's order.
 * Slices 06 and 08 append their funnel columns (*Emailed*, *Clicked*, *Voucher
 * used*, *Revenue*) to the view and here; the view test keeps the two equal.
 */
export const MIGRATION_SUMMARY_COLUMNS = [
  "imported",
  "imported_created",
  "imported_matched",
  "signed_up",
  "signed_up_before_import",
  "batches_applied",
  "clicked",
  "vouchers_issued",
  "vouchers_used",
  "voucher_orders",
  "voucher_revenue",
] as const;

export interface MigrationSummary {
  /** Migrated customers. */
  imported: number;
  /** Of those, created by the import. */
  created: number;
  /** Of those, matched to (merged into) an existing Customer. */
  matched: number;
  /** Of `imported`, the ones with an account now. */
  signedUp: number;
  /** Of `signedUp`, the ones whose login predates their import. */
  signedUpBeforeImport: number;
  /** Import batches ever applied. The card shows from the first one. */
  batchesApplied: number;
  /** Of `imported`, the ones who opened a **Claim link** (slice 06). */
  clicked: number;
  /** Of `imported`, the ones holding a **Welcome-back voucher**. */
  vouchersIssued: number;
  /** Of those, redeemed. */
  vouchersUsed: number;
  /** Paid **Orders** whose coupon is a Welcome-back voucher. */
  voucherOrders: number;
  /** Their total, SGD. */
  voucherRevenue: number;
}

const count = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** The view's one row as the card reads it. Counts may arrive as strings (bigint). */
export function migrationSummaryFromRow(row: Partial<Record<(typeof MIGRATION_SUMMARY_COLUMNS)[number], unknown>> | null): MigrationSummary {
  return {
    imported: count(row?.imported),
    created: count(row?.imported_created),
    matched: count(row?.imported_matched),
    signedUp: count(row?.signed_up),
    signedUpBeforeImport: count(row?.signed_up_before_import),
    batchesApplied: count(row?.batches_applied),
    clicked: count(row?.clicked),
    vouchersIssued: count(row?.vouchers_issued),
    vouchersUsed: count(row?.vouchers_used),
    voucherOrders: count(row?.voucher_orders),
    voucherRevenue: count(row?.voucher_revenue),
  };
}

/** The share of imported Customers who have signed up, as a whole percent. */
export function signedUpPercent(summary: Pick<MigrationSummary, "imported" | "signedUp">): number {
  return percentOf(summary.signedUp, summary.imported);
}

/** `part` of `whole` as a whole percent; 0 when `whole` is 0. */
export function percentOf(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/**
 * The card's numbers, or null when the read failed: the card is then left out
 * and the Customers list still renders.
 */
export async function getMigrationSummary(): Promise<MigrationSummary | null> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("admin_customer_migration_summary")
      .select(MIGRATION_SUMMARY_COLUMNS.join(", "))
      .maybeSingle();
    if (error) return null;
    return migrationSummaryFromRow(data as Record<string, unknown> | null);
  } catch {
    return null;
  }
}

// ─── The From Shopify card ───────────────────────────────────────────────────

/** A Migrated customer's Shopify-era facts, with the batch that brought them. */
export interface MigratedCustomerFacts {
  /** False: merged into a Customer who already existed. */
  createdByImport: boolean;
  importedAt: string;
  /** The **Claim** (slice 05); null until then. */
  claimedAt: string | null;
  shopifyOrdersCount: number;
  shopifyAmountSpent: number;
  shopifyTags: string[];
  shopifyNote: string | null;
  /** *Accepts Email Marketing* in the export: a snapshot, not current consent. */
  emailMarketingAtExport: "yes" | "no";
  /** The export's date. */
  exportedAt: string;
  batch: {
    id: string;
    fileName: string;
    appliedAt: string | null;
    rolledBackAt: string | null;
  } | null;
  /** The first click of any of their **Claim links** (slice 06); null if none was opened. */
  claimLinkFirstClickedAt: string | null;
  /** Their **Welcome-back voucher** (slice 06); null when none was issued. */
  welcomeVoucher: MigratedCustomerVoucher | null;
}

/** The Welcome-back voucher as the From Shopify card shows it. */
export interface MigratedCustomerVoucher {
  code: string;
  /** From the Customer overview, so the card agrees with the list's Voucher filter. */
  state: Exclude<WelcomeVoucherState, "none">;
  discountType: DiscountType;
  value: number;
  currency: string;
  expiresAt: string | null;
}

/** What slice 06 adds to the From Shopify card, read beside the migrated row. */
export interface MigratedCustomerExtras {
  claimLinkFirstClickedAt: string | null;
  welcomeVoucher: MigratedCustomerVoucher | null;
}

const NO_EXTRAS: MigratedCustomerExtras = { claimLinkFirstClickedAt: null, welcomeVoucher: null };

type MigratedRow = {
  created_by_import: boolean;
  imported_at: string;
  claimed_at: string | null;
  shopify_orders_count: number;
  shopify_amount_spent: number | string;
  shopify_tags: string[] | null;
  shopify_note: string | null;
  email_marketing_at_export: "yes" | "no";
  exported_at: string;
  batch_id: string;
  customer_import_batches:
    | { id: string; file_name: string; applied_at: string | null; rolled_back_at: string | null }
    | null;
};

const MIGRATED_SELECT =
  "created_by_import, imported_at, claimed_at, shopify_orders_count, shopify_amount_spent, shopify_tags, " +
  "shopify_note, email_marketing_at_export, exported_at, batch_id, " +
  "customer_import_batches(id, file_name, applied_at, rolled_back_at)";

export function migratedFactsFromRow(
  row: MigratedRow,
  extras: MigratedCustomerExtras = NO_EXTRAS,
): MigratedCustomerFacts {
  const b = row.customer_import_batches;
  return {
    createdByImport: row.created_by_import,
    importedAt: row.imported_at,
    claimedAt: row.claimed_at,
    shopifyOrdersCount: count(row.shopify_orders_count),
    shopifyAmountSpent: count(row.shopify_amount_spent),
    shopifyTags: row.shopify_tags ?? [],
    shopifyNote: row.shopify_note?.trim() ? row.shopify_note : null,
    emailMarketingAtExport: row.email_marketing_at_export,
    exportedAt: row.exported_at,
    batch: b
      ? { id: b.id, fileName: b.file_name, appliedAt: b.applied_at, rolledBackAt: b.rolled_back_at }
      : { id: row.batch_id, fileName: "", appliedAt: null, rolledBackAt: null },
    claimLinkFirstClickedAt: extras.claimLinkFirstClickedAt,
    welcomeVoucher: extras.welcomeVoucher,
  };
}

type OverviewExtrasRow = { claim_link_first_clicked_at: string | null; welcome_voucher_state: WelcomeVoucherState };
type VoucherRow = {
  code: string;
  discount_type: DiscountType;
  discount_value: number | string;
  currency: string;
  expires_at: string | null;
};

/** Pure — the slice 06 facts from the overview row and the voucher row. */
export function migratedExtrasFromRows(
  overview: OverviewExtrasRow | null,
  voucher: VoucherRow | null,
): MigratedCustomerExtras {
  const state = overview?.welcome_voucher_state ?? "none";
  return {
    claimLinkFirstClickedAt: overview?.claim_link_first_clicked_at ?? null,
    welcomeVoucher:
      voucher && state !== "none"
        ? {
            code: voucher.code,
            state,
            discountType: voucher.discount_type,
            value: count(voucher.discount_value),
            currency: voucher.currency,
            expiresAt: voucher.expires_at,
          }
        : null,
  };
}

export type MigratedCustomerResult = { ok: true; facts: MigratedCustomerFacts | null } | { ok: false };

/** The Customer's Shopify-era facts; `facts` is null for a Customer who is not a Migrated customer. */
export async function getMigratedCustomer(customerId: string): Promise<MigratedCustomerResult> {
  try {
    const admin = supabaseAdmin();
    const [migrated, overview, voucher] = await Promise.all([
      admin.from("migrated_customers").select(MIGRATED_SELECT).eq("customer_id", customerId).maybeSingle(),
      // Slice 06: the Claim link's first click and the voucher's state, from
      // the overview, so the card and the list's Voucher filter agree.
      admin
        .from("admin_customer_overview")
        .select("claim_link_first_clicked_at, welcome_voucher_state")
        .eq("id", customerId)
        .maybeSingle(),
      admin
        .from("coupons")
        .select("code, discount_type, discount_value, currency, expires_at")
        .eq("customer_id", customerId)
        .eq("issued_for", "welcome_back")
        .maybeSingle(),
    ]);
    if (migrated.error) return { ok: false };
    if (!migrated.data) return { ok: true, facts: null };
    // A failed slice 06 read leaves those rows out of the card, not the card.
    const extras = migratedExtrasFromRows(
      overview.error ? null : (overview.data as OverviewExtrasRow | null),
      voucher.error ? null : (voucher.data as VoucherRow | null),
    );
    return { ok: true, facts: migratedFactsFromRow(migrated.data as unknown as MigratedRow, extras) };
  } catch {
    return { ok: false };
  }
}
