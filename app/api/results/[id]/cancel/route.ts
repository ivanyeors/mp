import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { transitionResult } from "@/lib/result-lifecycle";
import { releaseHold } from "@/lib/authorization-hold";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  /**
   * Write the cancellation even when the hold could not be released. A Stripe
   * authorization that has already died cannot be cancelled, and without this the
   * row stays open forever — which is the exact trap the decline route falls into.
   */
  force: z.boolean().optional(),
  reason: z.string().max(500).optional(),
});

/**
 * Staff void of an open Result. Unlike decline (customer-driven, `assigned` only)
 * and the SLA cron (`held` only), this covers both open states — an `assigned`
 * Result whose customer goes quiet was previously unreachable by any human.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = await requireAdmin("results");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { force = false, reason } = parsed.data;
  const admin = supabaseAdmin();

  const { data: row, error: loadErr } = await admin
    .from("mp_config_responses")
    .select("id, status, filling_template_id, payment_intent_id, order_id")
    .eq("id", id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (row.order_id) {
    return NextResponse.json(
      {
        error:
          "This Result already has an Order. Cancel or refund it from the Order instead.",
        orderId: row.order_id,
      },
      { status: 400 },
    );
  }

  const life = transitionResult(
    {
      status: (row.status as "held") ?? "held",
      filling_template_id: row.filling_template_id,
      payment_intent_id: row.payment_intent_id,
    },
    { action: "cancel" },
  );
  if (!life.ok) return NextResponse.json({ error: life.error }, { status: 400 });

  let holdReleased = false;
  let releaseError: string | null = null;
  if (life.releaseHold && row.payment_intent_id) {
    try {
      await releaseHold(row.payment_intent_id);
      holdReleased = true;
    } catch (e) {
      releaseError = e instanceof Error ? e.message : "Failed to release hold";
      // Without force this behaves like decline: refuse rather than silently
      // leaving a live authorization on the customer's card.
      if (!force) {
        return NextResponse.json(
          { error: releaseError, canForce: true },
          { status: 502 },
        );
      }
    }
  }

  // CAS on the status we validated, so a concurrent accept/decline wins cleanly
  // instead of both writing.
  const { data: updated, error: updateErr } = await admin
    .from("mp_config_responses")
    .update({ status: life.status })
    .eq("id", id)
    .eq("status", row.status as string)
    .select("id")
    .maybeSingle();

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  if (!updated) {
    return NextResponse.json(
      { error: "Result changed while cancelling — reload and try again." },
      { status: 409 },
    );
  }

  await recordAdminAction({
    actor: await getAdminContext(),
    action: "result.cancel",
    entityType: "mp_config_response",
    entityId: id,
    before: { status: row.status },
    after: { status: life.status, holdReleased, forced: force, releaseError, reason: reason ?? null },
  });

  return NextResponse.json({
    ok: true,
    status: life.status,
    holdReleased,
    releaseError,
  });
}
