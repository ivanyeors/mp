import { NextResponse } from "next/server";

import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { getPublicOrigin } from "@/lib/site-url";
import { sendPaymentRequest } from "@/lib/staff-orders/send";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/staff-orders/[id]/send — email a Staff order's Payment link again
 * (ADR 0048). Renews the link for 7 days, so it also revives one that lapsed
 * before the daily job cancelled its Order. Refused once the Order is paid or
 * closed.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const outcome = await sendPaymentRequest(supabaseAdmin(), id, {
    origin: getPublicOrigin(req),
    actorEmail: ctx.email,
  }).catch((err: unknown) => ({
    ok: false as const,
    status: 500,
    error: err instanceof Error ? err.message : "Could not send the link",
  }));
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });

  await recordAdminAction({
    actor: { userId: ctx.userId, email: ctx.email, memberId: ctx.memberId },
    action: "order.payment_link_send",
    entityType: "order",
    entityId: id,
    after: { sent_to: outcome.sentTo, expires_at: outcome.expiresAt },
  });

  return NextResponse.json({ ok: true, sent_to: outcome.sentTo, expires_at: outcome.expiresAt, url: outcome.url });
}
