import { supabaseAdmin } from "@/lib/supabase/server";
import { ACCOUNT_GROUP } from "@/lib/crm/timeline/groups";
import { joinBatches, readStream } from "@/lib/crm/timeline/read";
import type { TimelineAdapter } from "@/lib/crm/timeline/types";
import { formatPoints } from "@/lib/points/value";

/**
 * The Customer's account on the timeline (`customers`), from the Shopify
 * customer migration (ADR 0029):
 *
 * - imported, as a **Migrated customer** (`migrated_customers.imported_at`,
 *   migration slice 02);
 * - **Signed up**: when the current login was bound to the Customer
 *   (`customers.account_linked_at`, slice 12). For a login linked before that
 *   slice it is the login's creation, the closest fact there is; the Account
 *   card says so;
 * - **Claimed**, their first sign-in after the import (`claimed_at`, slice 05);
 * - the **Claim bonus** (PRD-loyalty-points slice 05), read from the Points
 *   ledger: its one `claim_bonus` entry, at the time it was written. For a
 *   Customer who claimed before points launched, that is the later sign-in
 *   that granted it, not the Claim.
 */

type LinkedRow = { id: string; account_linked_at: string | null };

type MigratedRow = { customer_id: string; created_by_import: boolean; imported_at: string; claimed_at: string | null };

type ClaimBonusRow = { id: string; points: number; created_at: string };

export const accountAdapter: TimelineAdapter = {
  key: "account",
  group: ACCOUNT_GROUP,
  kinds: ["account.imported", "account.signed_up", "account.claimed", "account.claim_bonus"],
  permission: "customers",
  async load(customer, before, limit) {
    const db = supabaseAdmin();
    const migrated = () =>
      db
        .from("migrated_customers")
        .select("customer_id, created_by_import, imported_at, claimed_at")
        .eq("customer_id", customer.id);
    return joinBatches(
      await Promise.all([
        readStream<MigratedRow>(migrated(), "imported_at", before, limit, (m) => ({
          id: `account.imported:${m.customer_id}`,
          at: m.imported_at,
          kind: "account.imported",
          ref: { type: "migrated_customer", id: m.customer_id },
          summary: m.created_by_import
            ? "Imported from Shopify as a new Customer"
            : "Imported from Shopify, matched to this Customer",
        })),
        readStream<LinkedRow>(
          db.from("customers").select("id, account_linked_at").eq("id", customer.id),
          "account_linked_at",
          before,
          limit,
          (c) => ({
            id: `account.signed_up:${c.id}`,
            at: c.account_linked_at!,
            kind: "account.signed_up",
            ref: { type: "customer", id: c.id },
            summary: "Signed up: a login was linked to this Customer",
          }),
        ),
        readStream<MigratedRow>(migrated(), "claimed_at", before, limit, (m) => ({
          id: `account.claimed:${m.customer_id}`,
          at: m.claimed_at!,
          kind: "account.claimed",
          ref: { type: "migrated_customer", id: m.customer_id },
          summary: "Claimed: first sign-in since the import",
        })),
        // At most one: points_ledger_one_claim_bonus.
        readStream<ClaimBonusRow>(
          db
            .from("points_ledger")
            .select("id, points, created_at")
            .eq("customer_id", customer.id)
            .eq("kind", "claim_bonus"),
          "created_at",
          before,
          limit,
          (b) => ({
            id: `account.claim_bonus:${b.id}`,
            at: b.created_at,
            kind: "account.claim_bonus",
            ref: { type: "points_ledger", id: b.id },
            summary: `Claim bonus: ${formatPoints(b.points)}`,
          }),
        ),
      ]),
    );
  },
};
