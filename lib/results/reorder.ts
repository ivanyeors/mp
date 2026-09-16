/**
 * Reorder: clone a finished-but-unpaid customisation into a fresh Result.
 *
 * A customer whose build expired or who declined it used to have one way back —
 * the configurator, from the first question. Everything they had already decided
 * was still on the row; nothing could reach it. This turns that dead end into
 * one button.
 *
 * A NEW Result, never a reopened one. `expired` and `declined` are terminal
 * (result-stage treats them as closed), and rewriting one would erase the record
 * that a customer lost a build — which is exactly the history worth keeping.
 * `reordered_from` carries the lineage instead.
 *
 * The clone is priced at TODAY's Costings, not the original quote. Costings is
 * the single source of sell price (CONTEXT.md); honouring a stale number would
 * put a second one beside it and could sell below current cost. The caller
 * surfaces the difference so nobody is surprised at the payment step.
 */

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadAssignedBuild } from "@/lib/results/assigned-build";

/**
 * Columns a reorder carries over: the customisation, and who it belongs to.
 *
 * An allowlist, deliberately, rather than "everything except…". The dangerous
 * fields here are the money and fulfilment ones — `payment_intent_id`,
 * `order_id`, `authorized_amount`, `topup_paid_at`. With a denylist, the day
 * someone adds a column is the day a clone silently inherits a PaymentIntent or
 * an Order that belongs to a different sale. An allowlist fails the safe way:
 * a new column is simply not carried until someone decides it should be.
 */
export const REORDER_CARRIED_COLUMNS = [
  // The measurements and the questionnaire behind them.
  "data",
  "measured_by_type",
  "measured_by_staff_id",
  "source",
  "assisted_by_admin_id",
  "product_type",
  // What was suggested, proposed and finally assigned.
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
  // The build itself.
  "filling_template_id",
  "filling_fingerprint",
  "preference_lines",
  "addon_lines",
  "recommendation_record",
  // Where it goes and in what currency.
  "shipping_method",
  "shipping_address",
  "currency",
  // Who it belongs to.
  "customer_email",
  "customer_id",
  "customer_phone",
  "location_id",
  // Attribution survives: the same partner introduced the same customer, and a
  // build they lose and rebuild should not quietly drop their commission.
  "partner_id",
  "ref_code",
  "attribution_source",
  "discovery_source",
  "discovery_source_other",
] as const;

/** Statuses a reorder may start from: finished, unpaid, and over. */
export const REORDERABLE_STATUSES = new Set(["expired", "declined"]);

export type ReorderResult =
  | {
      ok: true;
      resultId: string;
      accessToken: string;
      /** Today's total. */
      total: number;
      /** What it was quoted at before, when that is known and different. */
      previousTotal: number | null;
      priceChanged: boolean;
      currency: string;
    }
  | { ok: false; error: string; code?: "not_reorderable" | "out_of_stock" };

/**
 * Undo a half-made clone.
 *
 * The delete's own failure is folded into the message rather than dropped: a
 * rollback that does not land leaves a live `assigned` Result with a null
 * price sitting in the staff queue and in the payment-reminder scan, while the
 * customer is told the reorder failed. That is worth knowing about.
 */
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

/**
 * Build a fresh Result from a finished one.
 *
 * Ordering matters: the spatial placements are copied BEFORE the build is
 * priced, because `loadAssignedBuild` reads them to derive the pack list. Price
 * first and a spatial build would be costed off its template instead of off the
 * arrangement the customer actually had.
 */
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

  // A live clone already exists — hand that back rather than making another.
  //
  // This POST does real work (insert, copy, price), so it is slow enough for a
  // double tap or an edge retry to arrive twice. Without this each one becomes
  // its own payable order, chased separately by the reminder cron, and the
  // customer pays for whichever they happen to open.
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
    // Straight to `assigned`: the build is already decided, so there is nothing
    // for an operator to review. It is the customer who owes an answer.
    status: "assigned",
    assigned_at: new Date().toISOString(),
    is_final: true,
    // Money and fulfilment start empty. Spelled out rather than left to the
    // allowlist so the intent survives a future reader.
    order_id: null,
    order_item_id: null,
    authorized_amount: null,
    final_amount: null,
    payment_intent_id: null,
    topup_payment_intent_id: null,
    topup_paid_at: null,
    // A fresh reminder clock, not the spent one from the build they lost.
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

  // The snapshot is a COPY of the template's placements, not a reference to it
  // (see 20260719000002), precisely so a Result keeps its mix when the catalog
  // template later moves. Cloning the parent row without these would hand the
  // customer whatever that template says today — a different pillow under the
  // same name.
  const { data: placements, error: readErr } = await admin
    .from(table)
    .select("*")
    .eq("result_id", source.id);
  if (readErr) return { ok: false, error: await rollback(admin, newId, readErr.message) };

  if (placements && placements.length > 0) {
    // Spread then override, so a column added to the snapshot later is carried
    // without anyone having to remember this line.
    const rows = placements.map((p: Record<string, unknown>) => ({
      ...p,
      result_id: newId,
    }));
    const { error: copyErr } = await admin.from(table).insert(rows);
    // Cascade clears the placements; the parent has to go by hand. A Result
    // with half its fillings would price wrongly and look legitimate.
    if (copyErr) return { ok: false, error: await rollback(admin, newId, copyErr.message) };
  }

  const { data: fresh, error: reloadErr } = await admin
    .from("mp_config_responses")
    .select(
      "id, product_type, assigned_size, assigned_tier, assigned_length, filling_template_id, preference_lines, addon_lines, shipping_method, shipping_address, currency",
    )
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
    // Checked here rather than left to Accept: a Result that cannot be paid
    // for is worse than a refusal, because it looks like an order.
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
    // Rounded to cents before comparing: a float that differs in the eighth
    // decimal is not a price change worth telling anyone about.
    priceChanged:
      previousTotal != null && Math.round(previousTotal * 100) !== Math.round(total * 100),
    currency: (fresh.currency as string | null) ?? "SGD",
  };
}
