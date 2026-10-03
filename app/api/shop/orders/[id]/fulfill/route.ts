import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { markOrderShipped } from "@/lib/ecommerce/fulfilment";

export const runtime = "nodejs";

const FulfillSchema = z.object({
  tracking_number: z.string().optional(),
  tracking_url: z.string().url().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const parsed = FulfillSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await markOrderShipped(supabaseAdmin(), id, {
    trackingNumber: parsed.data.tracking_number,
    trackingUrl: parsed.data.tracking_url,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ ok: true, row: result.row });
}
