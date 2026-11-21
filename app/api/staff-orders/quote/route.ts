import { NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth/admin";
import { quoteStaffOrder, quoteView } from "@/lib/staff-orders/quote";
import { StaffOrderDraftSchema } from "@/lib/staff-orders/shared";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;

  const parsed = StaffOrderDraftSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid order" }, { status: 400 });
  }

  try {
    const outcome = await quoteStaffOrder(supabaseAdmin(), parsed.data);
    if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    return NextResponse.json({ ok: true, quote: quoteView(outcome.quote) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not price the order" }, { status: 500 });
  }
}
