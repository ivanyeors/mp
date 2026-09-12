import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { resultStage } from "@/lib/results/result-stage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Queue counts for the Admin Panel sidebar badge: how many Results need staff
 * right now, and how many are stuck.
 *
 * Deliberately not a SQL aggregate — "stuck" is derived in `resultStage`, and
 * duplicating that logic in SQL would let the two drift. Instead this scans only
 * OPEN Results (never captured/declined/expired/cancelled) with the handful of
 * columns the derivation needs, which is a small, indexed set.
 */
export async function GET() {
  const denied = await requireAdmin("results");
  if (denied) return denied;

  const admin = supabaseAdmin();

  const { data: rows, error } = await admin
    .from("mp_config_responses")
    .select(
      "id, status, source, payment_intent_id, created_at, order_id, topup_paid_at, authorized_amount"
    )
    .in("status", ["held", "assigned"]);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Orders only matter for the needs_attention signal; open Results rarely have one
  // (an order_id without capture is itself a stuck state).
  const orderIds = (rows ?? []).map((r) => r.order_id).filter(Boolean) as string[];
  const attentionByOrder = new Map<string, boolean>();
  if (orderIds.length > 0) {
    const { data: orders } = await admin
      .from("orders")
      .select("id, needs_attention")
      .in("id", orderIds);
    for (const o of orders ?? []) attentionByOrder.set(o.id, Boolean(o.needs_attention));
  }

  const now = new Date();
  let needsAssign = 0;
  let stuck = 0;
  for (const r of rows ?? []) {
    const { stage } = resultStage(
      {
        status: r.status,
        source: r.source,
        payment_intent_id: r.payment_intent_id,
        created_at: r.created_at,
        order_id: r.order_id,
        topup_paid_at: r.topup_paid_at,
        authorized_amount: r.authorized_amount,
        order: r.order_id
          ? {
              status: null,
              delivered_at: null,
              needs_attention: attentionByOrder.get(r.order_id) ?? false,
            }
          : null,
      },
      now,
    );
    if (stage === "stuck") stuck += 1;
    else if (stage === "needs_assign") needsAssign += 1;
  }

  return NextResponse.json({ ok: true, needsAssign, stuck });
}
