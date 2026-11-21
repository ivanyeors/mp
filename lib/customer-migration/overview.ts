import { supabaseAdmin } from "@/lib/supabase/server";

const count = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export interface MigratedCustomerFacts {
  createdByImport: boolean;
  importedAt: string;
  claimedAt: string | null;
  shopifyOrdersCount: number;
  shopifyAmountSpent: number;
  shopifyTags: string[];
  shopifyNote: string | null;
  emailMarketingAtExport: "yes" | "no";
  exportedAt: string;
  batch: {
    id: string;
    fileName: string;
    appliedAt: string | null;
    rolledBackAt: string | null;
  } | null;
  claimLinkFirstClickedAt: string | null;
  claimBonusAt: string | null;
}

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

export function migratedExtrasFromRow(overview: OverviewExtrasRow | null): MigratedCustomerExtras {
  return {
    claimLinkFirstClickedAt: overview?.claim_link_first_clicked_at ?? null,
    claimBonusAt: overview?.claim_bonus_at ?? null,
  };
}

export type MigratedCustomerResult = { ok: true; facts: MigratedCustomerFacts | null } | { ok: false };

export async function getMigratedCustomer(customerId: string): Promise<MigratedCustomerResult> {
  try {
    const admin = supabaseAdmin();
    const [migrated, overview] = await Promise.all([
      admin.from("migrated_customers").select(MIGRATED_SELECT).eq("customer_id", customerId).maybeSingle(),
      admin
        .from("admin_customer_overview")
        .select("claim_link_first_clicked_at, claim_bonus_at")
        .eq("id", customerId)
        .maybeSingle(),
    ]);
    if (migrated.error) return { ok: false };
    if (!migrated.data) return { ok: true, facts: null };
    const extras = migratedExtrasFromRow(overview.error ? null : (overview.data as OverviewExtrasRow | null));
    return { ok: true, facts: migratedFactsFromRow(migrated.data as unknown as MigratedRow, extras) };
  } catch {
    return { ok: false };
  }
}
