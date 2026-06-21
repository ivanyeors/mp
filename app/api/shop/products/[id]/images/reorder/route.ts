import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

const ReorderSchema = z.object({
  order: z.array(z.string().uuid()),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("products");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = ReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();

  for (let i = 0; i < parsed.data.order.length; i++) {
    await admin
      .from("product_images")
      .update({ position: i })
      .eq("id", parsed.data.order[i])
      .eq("product_id", id);
  }

  return NextResponse.json({ ok: true });
}
