import { supabaseAdmin } from "@/lib/supabase/server";
import { ACCOUNT_GROUP } from "@/lib/crm/timeline/groups";
import { joinBatches, readStream } from "@/lib/crm/timeline/read";
import type { TimelineAdapter } from "@/lib/crm/timeline/types";

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
 * - the **Welcome-back voucher** issued at the Claim (`coupons.created_at`,
 *   `issued_for = 'welcome_back'`, slice 05). A coupon stores no time it was
 *   used, so whether it is used, expired or still open is its pill. The Order
 *   it went on shows under Orders. Its code is not shown.
 */

type LinkedRow = { id: string; account_linked_at: string | null };

type MigratedRow = { customer_id: string; created_by_import: boolean; imported_at: string; claimed_at: string | null };

type VoucherRow = {
  id: string;
  is_active: boolean;
  usage_limit: number | null;
  usage_count: number;
  expires_at: string | null;
  created_at: string;
};

/** The voucher as it stands now: a pill, never a dated step. */
function voucherStatus(v: VoucherRow, now: number): string {
  if (v.usage_limit !== null && v.usage_count >= v.usage_limit) return "used";
  if (!v.is_active) return "inactive";
  if (v.expires_at !== null && Date.parse(v.expires_at) <= now) return "expired";
  return "open";
}

export const accountAdapter: TimelineAdapter = {
  key: "account",
  group: ACCOUNT_GROUP,
  kinds: ["account.imported", "account.signed_up", "account.claimed", "account.voucher_issued"],
  permission: "customers",
  async load(customer, before, limit) {
    const db = supabaseAdmin();
    const migrated = () =>
      db
        .from("migrated_customers")
        .select("customer_id, created_by_import, imported_at, claimed_at")
        .eq("customer_id", customer.id);
    const now = Date.now();
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
        readStream<VoucherRow>(
          db
            .from("coupons")
            .select("id, is_active, usage_limit, usage_count, expires_at, created_at")
            .eq("customer_id", customer.id)
            .eq("issued_for", "welcome_back"),
          "created_at",
          before,
          limit,
          (v) => ({
            id: `account.voucher_issued:${v.id}`,
            at: v.created_at,
            kind: "account.voucher_issued",
            ref: { type: "coupon", id: v.id },
            summary: "Welcome-back voucher issued",
            status: voucherStatus(v, now),
          }),
        ),
      ]),
    );
  },
};
