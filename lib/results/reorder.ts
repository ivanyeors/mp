import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ASSIGNED_BUILD_COLUMNS, loadAssignedBuild } from "@/lib/results/assigned-build";

export const REORDER_CARRIED_COLUMNS = [
  "data",
  "measured_by_type",
  "measured_by_staff_id",
  "source",
  "assisted_by_admin_id",
  "product_type",
  "suggested_size",
  "suggested_tier",
  "suggested_length",
  "proposed_size",
  "proposed_tier",
  "proposed_length",
  "proposed_filling_template_id",
  "assigned_size",
  "assigned_tier",
  "assigned_length",
  "filling_template_id",
  "filling_fingerprint",
  "preference_lines",
  "addon_lines",
  "recommendation_record",
  "shipping_method",
  "shipping_address",
  "shipping_rate",
  "currency",
  "customer_email",
  "customer_id",
  "customer_phone",
  "location_id",
  "partner_id",
  "ref_code",
  "attribution_source",
  "discovery_source",
  "discovery_source_other",
] as const;

export const REORDERABLE_STATUSES = new Set(["expired", "declined"]);

export type ReorderResult =
  | {
      ok: true;
      resultId: string;
      accessToken: string;
      total: number;
      previousTotal: number | null;
      priceChanged: boolean;
      currency: string;
    }
  | { ok: false; error: string; code?: "not_reorderable" | "out_of_stock" };

async function rollback(
  admin: SupabaseClient,
  id: string,
  reason: string,
): Promise<string> {
  const { error } = await admin.from("mp_config_responses").delete().eq("id", id);
  if (error) {
    return `${reason} (and the half-made order ${id} could not be cleaned up: ${error.message})`;
  }
  return reason;
}

type SourceRow = Record<string, unknown> & {
  id: string;
  status: string | null;
  final_amount: number | string | null;
  currency: string | null;
  product_type: string | null;
};

export async function reorderResult(
  admin: SupabaseClient,
  source: SourceRow,
): Promise<ReorderResult> {
  if (!REORDERABLE_STATUSES.has(source.status ?? "")) {
    return {
      ok: false,
      code: "not_reorderable",
      error: `Only an expired or declined customisation can be reordered (this one is ${source.status ?? "unknown"})`,
    };
  }

  const { data: existing } = await admin
    .from("mp_config_responses")
    .select("id, access_token, final_amount, currency")
    .eq("reordered_from", source.id)
    .in("status", ["assigned", "accepted", "captured"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id && existing.access_token) {
    const total = existing.final_amount == null ? 0 : Number(existing.final_amount);
    const previousTotal =
      source.final_amount == null ? null : Number(source.final_amount);
    return {
      ok: true,
      resultId: existing.id as string,
      accessToken: existing.access_token as string,
      total,
      previousTotal,
      priceChanged:
        previousTotal != null &&
        Math.round(previousTotal * 100) !== Math.round(total * 100),
      currency: (existing.currency as string | null) ?? "SGD",
    };
  }

  const newId = randomUUID();
  const accessToken = randomUUID();

  const carried: Record<string, unknown> = {};
  for (const key of REORDER_CARRIED_COLUMNS) {
    if (key in source) carried[key] = source[key];
  }

  const { error: insertErr } = await admin.from("mp_config_responses").insert({
    ...carried,
    id: newId,
    access_token: accessToken,
    reordered_from: source.id,
    status: "assigned",
    assigned_at: new Date().toISOString(),
    is_final: true,
    order_id: null,
    order_item_id: null,
    authorized_amount: null,
    final_amount: null,
    payment_intent_id: null,
    topup_payment_intent_id: null,
    topup_paid_at: null,
    last_reminder_at: null,
    payment_reminder_last_at: null,
    payment_reminder_count: 0,
    is_pre_order: false,
    pre_order_restock_notified_at: null,
  });
  if (insertErr) return { ok: false, error: insertErr.message };

  const isBolster = source.product_type === "bolster";
  const table = isBolster
    ? "result_bolster_filling_placements"
    : "result_filling_placements";

  const { data: placements, error: readErr } = await admin
    .from(table)
    .select("*")
    .eq("result_id", source.id);
  if (readErr) return { ok: false, error: await rollback(admin, newId, readErr.message) };

  if (placements && placements.length > 0) {
    const rows = placements.map((p: Record<string, unknown>) => ({
      ...p,
      result_id: newId,
    }));
    const { error: copyErr } = await admin.from(table).insert(rows);
    if (copyErr) return { ok: false, error: await rollback(admin, newId, copyErr.message) };
  }

  const { data: fresh, error: reloadErr } = await admin
    .from("mp_config_responses")
    .select(ASSIGNED_BUILD_COLUMNS)
    .eq("id", newId)
    .maybeSingle();
  if (reloadErr || !fresh) {
    const error = await rollback(
      admin,
      newId,
      reloadErr?.message ?? "Reorder could not be re-read",
    );
    return { ok: false, error };
  }

  const build = await loadAssignedBuild(admin, fresh);
  if (!build.ok) return { ok: false, error: await rollback(admin, newId, build.error) };
  if (build.shortages.length > 0) {
    const detail = build.shortages.map((s) => s.name).join(", ");
    const error = await rollback(
      admin,
      newId,
      `Out of stock right now: ${detail}. Get in touch and we will let you know when it is back.`,
    );
    return { ok: false, code: "out_of_stock", error };
  }

  const total = build.pricing.total;
  const { error: priceErr } = await admin
    .from("mp_config_responses")
    .update({ final_amount: total })
    .eq("id", newId);
  if (priceErr) return { ok: false, error: await rollback(admin, newId, priceErr.message) };

  const previousTotal =
    source.final_amount == null ? null : Number(source.final_amount);

  return {
    ok: true,
    resultId: newId,
    accessToken,
    total,
    previousTotal,
    priceChanged:
      previousTotal != null && Math.round(previousTotal * 100) !== Math.round(total * 100),
    currency: (fresh.currency as string | null) ?? "SGD",
  };
}
