import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * What the Admin Panel shows about the Shopify import (migration slice 12):
 * the From Shopify card on a Migrated customer's detail page. It reads
 * `migrated_customers` and the Import batch rows, whatever created them, with
 * the service role; the caller has checked `customers`.
 */

const count = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

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
  /** When their **Claim bonus** was granted (PRD-loyalty-points); null without one. */
  claimBonusAt: string | null;
}

/** What the From Shopify card reads from the Customer overview, beside the migrated row. */
export interface MigratedCustomerExtras {
  claimLinkFirstClickedAt: string | null;
  claimBonusAt: string | null;
}

const NO_EXTRAS: MigratedCustomerExtras = { claimLinkFirstClickedAt: null, claimBonusAt: null };

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
    claimBonusAt: extras.claimBonusAt,
  };
}

type OverviewExtrasRow = { claim_link_first_clicked_at: string | null; claim_bonus_at: string | null };

/** Pure — the From Shopify card's facts from the Customer overview row. */
export function migratedExtrasFromRow(overview: OverviewExtrasRow | null): MigratedCustomerExtras {
  return {
    claimLinkFirstClickedAt: overview?.claim_link_first_clicked_at ?? null,
    claimBonusAt: overview?.claim_bonus_at ?? null,
  };
}

export type MigratedCustomerResult = { ok: true; facts: MigratedCustomerFacts | null } | { ok: false };

/** The Customer's Shopify-era facts; `facts` is null for a Customer who is not a Migrated customer. */
export async function getMigratedCustomer(customerId: string): Promise<MigratedCustomerResult> {
  try {
    const admin = supabaseAdmin();
    const [migrated, overview] = await Promise.all([
      admin.from("migrated_customers").select(MIGRATED_SELECT).eq("customer_id", customerId).maybeSingle(),
      // The Claim link's first click and the Claim bonus, from the overview,
      // so the card and the list agree.
      admin
        .from("admin_customer_overview")
        .select("claim_link_first_clicked_at, claim_bonus_at")
        .eq("id", customerId)
        .maybeSingle(),
    ]);
    if (migrated.error) return { ok: false };
    if (!migrated.data) return { ok: true, facts: null };
    // A failed overview read leaves those rows out of the card, not the card.
    const extras = migratedExtrasFromRow(overview.error ? null : (overview.data as OverviewExtrasRow | null));
    return { ok: true, facts: migratedFactsFromRow(migrated.data as unknown as MigratedRow, extras) };
  } catch {
    return { ok: false };
  }
}
