import { supabaseAdmin } from "@/lib/supabase/server";

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
  };
}

/** The share of imported Customers who have signed up, as a whole percent. */
export function signedUpPercent(summary: Pick<MigrationSummary, "imported" | "signedUp">): number {
  return summary.imported > 0 ? Math.round((summary.signedUp / summary.imported) * 100) : 0;
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
}

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

export function migratedFactsFromRow(row: MigratedRow): MigratedCustomerFacts {
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
  };
}

export type MigratedCustomerResult = { ok: true; facts: MigratedCustomerFacts | null } | { ok: false };

/** The Customer's Shopify-era facts; `facts` is null for a Customer who is not a Migrated customer. */
export async function getMigratedCustomer(customerId: string): Promise<MigratedCustomerResult> {
  try {
    const { data, error } = await supabaseAdmin()
      .from("migrated_customers")
      .select(MIGRATED_SELECT)
      .eq("customer_id", customerId)
      .maybeSingle();
    if (error) return { ok: false };
    return { ok: true, facts: data ? migratedFactsFromRow(data as unknown as MigratedRow) : null };
  } catch {
    return { ok: false };
  }
}
