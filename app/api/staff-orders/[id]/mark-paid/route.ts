import { NextResponse } from "next/server";

import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { markStaffOrderPaid } from "@/lib/staff-orders/mark-paid";
import { PaidHowSchema } from "@/lib/staff-orders/shared";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = PaidHowSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Say how it was paid" }, { status: 400 });
  }
  const how = parsed.data;

  const { id } = await params;
  const outcome = await markStaffOrderPaid(supabaseAdmin(), id, how, { userId: ctx.userId, email: ctx.email }).catch(
    (err: unknown) => ({
      ok: false as const,
      status: 500,
      error: err instanceof Error ? err.message : "Could not mark the order paid",
    }),
  );
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });

  await recordAdminAction({
    actor: { userId: ctx.userId, email: ctx.email, memberId: ctx.memberId },
    action: "order.mark_paid",
    entityType: "order",
    entityId: id,
    before: { paid_at: null },
    after: { paid_at: outcome.paidAt, paid: how, warnings: outcome.warnings },
  });

  return NextResponse.json({ ok: true, paid_at: outcome.paidAt, method: outcome.method, warnings: outcome.warnings });
}
