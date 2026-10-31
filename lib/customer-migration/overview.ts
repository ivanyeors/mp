import { supabaseAdmin } from "@/lib/supabase/server";
import type { JourneyStage, JourneyStageCount } from "./journey";

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
 * Slices 06 and 08 appended their funnel columns (*Emailed*, *Clicked*); the
 * Claim bonus and what points did replaced the voucher's in
 * PRD-loyalty-points slice 06; the Journey stages came last (2026-10-31).
 * The view test keeps the two equal.
 */
export const MIGRATION_SUMMARY_COLUMNS = [
  "imported",
  "imported_created",
  "imported_matched",
  "signed_up",
  "signed_up_before_import",
  "batches_applied",
  "clicked",
  "claim_bonuses",
  "migrated_points_spent",
  "points_orders",
  "points_revenue",
  "emailed",
  "emails_bounced",
  "emails_complained",
  "stage_imported",
  "stage_imported_unreachable",
  "stage_emailed",
  "stage_emailed_unreachable",
  "stage_clicked",
  "stage_clicked_unreachable",
  "stage_signed_up",
  "stage_claim_bonus",
  "stage_ordered",
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
  /** Of `imported`, the ones granted the **Claim bonus**. */
  claimBonuses: number;
  /** **Points** they spent on paid **Orders**. */
  migratedPointsSpent: number;
  /** Their paid **Orders** that used points. */
  pointsOrders: number;
  /** Those Orders' total, SGD. */
  pointsRevenue: number;
  /** Of `imported`, the ones a campaign email reached the provider for (slice 08). */
  emailed: number;
  /** Of `imported`, the ones with a hard bounce: left out of later waves. */
  emailsBounced: number;
  /** Of `imported`, the ones who marked one as spam: unsubscribed. */
  emailsComplained: number;
  /**
   * Where each of `imported` is now: their furthest **Journey stage**, and of
   * those, the ones no campaign email can reach (20261031120000). The stages
   * sum to `imported`; `unreachable` is 0 from *Signed up* on.
   */
  stages: Record<JourneyStage, JourneyStageCount>;
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
    claimBonuses: count(row?.claim_bonuses),
    migratedPointsSpent: count(row?.migrated_points_spent),
    pointsOrders: count(row?.points_orders),
    pointsRevenue: count(row?.points_revenue),
    emailed: count(row?.emailed),
    emailsBounced: count(row?.emails_bounced),
    emailsComplained: count(row?.emails_complained),
    stages: {
      imported: { here: count(row?.stage_imported), unreachable: count(row?.stage_imported_unreachable) },
      emailed: { here: count(row?.stage_emailed), unreachable: count(row?.stage_emailed_unreachable) },
      clicked: { here: count(row?.stage_clicked), unreachable: count(row?.stage_clicked_unreachable) },
      signed_up: { here: count(row?.stage_signed_up), unreachable: 0 },
      claim_bonus: { here: count(row?.stage_claim_bonus), unreachable: 0 },
      ordered: { here: count(row?.stage_ordered), unreachable: 0 },
    },
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
