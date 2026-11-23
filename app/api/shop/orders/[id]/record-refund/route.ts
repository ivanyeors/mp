import { NextResponse } from "next/server";

import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { RecordRefundSchema, recordOutsideRefund } from "@/lib/ecommerce/outside-refund";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;
  const actor = await getAdminContext();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = RecordRefundSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid refund." }, { status: 400 });
  }

  const { id: orderId } = await params;
  const outcome = await recordOutsideRefund(supabaseAdmin(), orderId, parsed.data, { email: actor.email });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });

  await recordAdminAction({
    actor,
    action: "order.refund_recorded",
    entityType: "order",
    entityId: orderId,
    before: null,
    after: { amount: outcome.amount, note: parsed.data.note, outside_stripe: true, fully_refunded: outcome.fullyRefunded },
  });

  return NextResponse.json({ ok: true, amount: outcome.amount, fully_refunded: outcome.fullyRefunded });
}
