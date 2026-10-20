import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import {
  cascadeEnding,
  companionLockReason,
  loadEndingPlan,
  notifyCompanionRemoved,
} from "@/lib/results/pair-ending";
import { getPublicOrigin } from "@/lib/site-url";
import { releaseHold } from "@/lib/authorization-hold";
import {
  loadMpConfigResponseDetail,
  toOwnerResultPayload,
} from "@/lib/results/admin/response-detail";
import { requireResultAccess } from "@/lib/results/access";

export const runtime = "nodejs";

const ParamsSchema = z.object({ id: z.string().uuid() });

/**
 * Dual-audience read: the Admin Panel Result detail and the guest configurator
 * both call this. Staff get the record unchanged; an Owner gets a redacted
 * projection; anyone holding only a Result id gets 403.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsedParams = ParamsSchema.safeParse({ id });
  if (!parsedParams.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const admin = supabaseAdmin();
  // Ownership is settled before the detail load, which runs the Rules Engine and
  // persists a recommendation record — work a refused caller should never trigger.
  const { data: authRow, error: authErr } = await admin
    .from("mp_config_responses")
    .select("access_token, customer_id, customer_email, status, order_id")
    .eq("id", parsedParams.data.id)
    .maybeSingle();
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 });
  if (!authRow) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const token = new URL(req.url).searchParams.get("token");
  const access = await requireResultAccess(authRow, token);
  if (!access.ok) return access.response;

  const result = await loadMpConfigResponseDetail(parsedParams.data.id);
  if (result.status !== 200) return NextResponse.json(result.body, { status: result.status });

  return NextResponse.json(
    access.mode === "staff" ? result.body : toOwnerResultPayload(result.body),
    { status: 200 },
  );
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Staff-only: the only callers are the two Admin Panel Results clients. GET and
  // POST stay open because the guest configurator uses them.
  const denied = await requireAdmin("results");
  if (denied) return denied;

  const { id } = await ctx.params;
  const parsedParams = ParamsSchema.safeParse({ id });
  if (!parsedParams.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const admin = supabaseAdmin();

  // Deleting the row used to orphan a live Stripe authorization on the customer's
  // card — nothing else references the payment intent once the row is gone.
  const { data: row } = await admin
    .from("mp_config_responses")
    .select(
      "id, payment_intent_id, status, order_id, paired_build_id, authorized_amount, customer_email, access_token, currency",
    )
    .eq("id", parsedParams.data.id)
    .maybeSingle();
  // A Paired build shares one hold (ADR 0026): deleting the Mbolster keeps it for
  // the Mpillow, and deleting the Mpillow cancels the Mbolster with it.
  const locked = row ? await companionLockReason(admin, row) : null;
  if (locked) return NextResponse.json({ error: locked, code: "pair_paid" }, { status: 409 });
  const plan = row ? await loadEndingPlan(admin, row) : null;

  if (row?.order_id) {
    return NextResponse.json(
      { error: "This Result has an Order. Delete is blocked — cancel the Order instead." },
      { status: 400 },
    );
  }

  if (row?.payment_intent_id && row.status !== "captured" && plan?.releaseHold) {
    try {
      await releaseHold(row.payment_intent_id);
    } catch (e) {
      return NextResponse.json(
        {
          error: `Could not release the payment hold: ${
            e instanceof Error ? e.message : "unknown error"
          }. Cancel the Result instead.`,
        },
        { status: 502 },
      );
    }
  }

  const { error } = await admin.from("mp_config_responses").delete().eq("id", parsedParams.data.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (plan) await cascadeEnding(admin, plan, "cancelled");
  if (plan && row) {
    await notifyCompanionRemoved(admin, { companion: row, partner: plan.partner, origin: getPublicOrigin(req) });
  }

  await recordAdminAction({
    actor: await getAdminContext(),
    action: "result.delete",
    entityType: "mp_config_response",
    entityId: parsedParams.data.id,
    before: { status: row?.status ?? null, payment_intent_id: row?.payment_intent_id ?? null },
  });

  return NextResponse.json({ ok: true });
}
