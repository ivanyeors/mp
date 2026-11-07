import { NextResponse } from "next/server";

import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { getPublicOrigin } from "@/lib/site-url";
import { createStaffOrder } from "@/lib/staff-orders/create";
import { payLinkUrl } from "@/lib/staff-orders/link";
import { quoteStaffOrder, quoteView } from "@/lib/staff-orders/quote";
import { sendPaymentRequest } from "@/lib/staff-orders/send";
import { CreateStaffOrderSchema } from "@/lib/staff-orders/shared";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/staff-orders — create a Staff order for a Customer (ADR 0048).
 *
 * Priced again here from the database, never from the body: the Order is
 * written from `quoteStaffOrder`, the same function the dialog's summary came
 * from. It is created `pending` with its Payment link, and the Payment request
 * is emailed unless Staff untick it. A failed email never loses the Order:
 * the answer says so, and the link can be copied or resent.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = CreateStaffOrderSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid order" }, { status: 400 });
  }
  const { send_email: sendEmail, ...draft } = parsed.data;

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
  let emailed: { ok: true; sentTo: string } | { ok: false; error: string } | null = null;
  if (sendEmail) {
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
    },
    { status: 201 },
  );
}
