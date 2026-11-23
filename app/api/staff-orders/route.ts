import { NextResponse } from "next/server";

import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { getPublicOrigin } from "@/lib/site-url";
import { createStaffOrder } from "@/lib/staff-orders/create";
import { payLinkUrl } from "@/lib/staff-orders/link";
import { markStaffOrderPaid } from "@/lib/staff-orders/mark-paid";
import { quoteStaffOrder, quoteView } from "@/lib/staff-orders/quote";
import { sendPaymentRequest } from "@/lib/staff-orders/send";
import { CreateStaffOrderSchema } from "@/lib/staff-orders/shared";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CreateStaffOrderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid order" }, { status: 400 });
  }
  const { send_email: sendEmail, paid: paidHow, ...draft } = parsed.data;

  const admin = supabaseAdmin();
  let created;
  let quote;
  try {
    const outcome = await quoteStaffOrder(admin, draft);
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    quote = outcome.quote;
    created = await createStaffOrder(admin, quote, { userId: ctx.userId, email: ctx.email });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not create the order" }, { status: 500 });
  }
  if (!created.ok) return NextResponse.json({ error: created.error }, { status: created.status });

  await recordAdminAction({
    actor: { userId: ctx.userId, email: ctx.email, memberId: ctx.memberId },
    action: "order.staff_create",
    entityType: "order",
    entityId: created.orderId,
    before: null,
    after: { order_number: created.orderNumber, customer_id: quote.customer.id, ...quoteView(quote) },
  });

  const origin = getPublicOrigin(req);
  const actor = { userId: ctx.userId, email: ctx.email };

  let paid: { ok: true; method: string; warnings: string[] } | { ok: false; error: string } | null = null;
  if (paidHow) {
    const marked = await markStaffOrderPaid(admin, created.orderId, paidHow, actor).catch((err: unknown) => ({
      ok: false as const,
      status: 500,
      error: err instanceof Error ? err.message : "Could not mark the order paid",
    }));
    paid = marked.ok ? { ok: true, method: marked.method, warnings: marked.warnings } : { ok: false, error: marked.error };
    if (marked.ok) {
      await recordAdminAction({
        actor: { ...actor, memberId: ctx.memberId },
        action: "order.mark_paid",
        entityType: "order",
        entityId: created.orderId,
        before: { paid_at: null },
        after: { paid_at: marked.paidAt, paid: paidHow, warnings: marked.warnings },
      });
    }
  }

  let emailed: { ok: true; sentTo: string } | { ok: false; error: string } | null = null;
  if (sendEmail && !paidHow) {
    const sent = await sendPaymentRequest(admin, created.orderId, { origin, actorEmail: ctx.email }).catch(
      (err: unknown) => ({ ok: false as const, status: 500, error: err instanceof Error ? err.message : "Email failed" }),
    );
    emailed = sent.ok ? { ok: true, sentTo: sent.sentTo } : { ok: false, error: sent.error };
  }

  return NextResponse.json(
    {
      ok: true,
      order: { id: created.orderId, order_number: created.orderNumber, total: quote.total },
      link: { url: payLinkUrl(origin, created.token, quote.customer.locale), expires_at: created.expiresAt },
      emailed,
      paid,
    },
    { status: 201 },
  );
}
