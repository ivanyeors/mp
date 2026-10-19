/**
 * Ending one member of a Paired build (ADR 0026) — decline, cancel, expiry,
 * delete. Loads the partner and asks `endingPlan` what the shared hold and the
 * partner should do, so no route can release a hold the other Result still
 * needs, or leave an Mbolster behind once its Mpillow has gone.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { endingPlan, pairAuthorized, type EndingPlan } from "./paired-build";

export type EndingRow = {
  id: string;
  paired_build_id?: string | null;
  payment_intent_id?: string | null;
  authorized_amount?: number | string | null;
};

export type LoadedEndingPlan = EndingPlan & {
  /** What releasing frees: the whole intent, which for a pair covers both. */
  intentAmount: number | null;
};

export async function loadEndingPlan(
  admin: SupabaseClient,
  row: EndingRow,
): Promise<LoadedEndingPlan> {
  if (!row.paired_build_id) {
    return {
      ...endingPlan(row, null),
      intentAmount: row.authorized_amount == null ? null : Number(row.authorized_amount),
    };
  }
  const { data: members } = await admin
    .from("mp_config_responses")
    .select("id, status, authorized_amount")
    .eq("paired_build_id", row.paired_build_id);
  // A companion whose anchor row is gone reads as one whose anchor has ended.
  const partner = (members ?? []).find((m) => m.id !== row.id);
  return {
    ...endingPlan(
      row,
      partner
        ? { id: String(partner.id), paired_build_id: row.paired_build_id, status: partner.status }
        : null,
    ),
    intentAmount: pairAuthorized(members ?? [row]),
  };
}

/**
 * End the partner the plan names, in the same status. Conditional on it still
 * being `held` or `assigned`, so a partner that moved on meanwhile is left alone.
 */
export async function cascadeEnding(
  admin: SupabaseClient,
  plan: EndingPlan,
  status: "declined" | "cancelled" | "expired",
): Promise<void> {
  if (!plan.cascadeTo) return;
  const { error } = await admin
    .from("mp_config_responses")
    .update({ status })
    .eq("id", plan.cascadeTo)
    .in("status", ["held", "assigned"]);
  if (error) console.error("Paired build cascade failed", plan.cascadeTo, error);
}
