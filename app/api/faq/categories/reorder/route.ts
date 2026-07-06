import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

const ReorderSchema = z.object({
  order: z.array(z.string().uuid()).min(1),
});

export async function PUT(req: Request) {
  const denied = await requireAdmin("page-builder");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = ReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const updates = parsed.data.order.map((id, index) =>
    admin
      .from("faq_categories")
      .update({ position: index, updated_at: new Date().toISOString() })
      .eq("id", id)
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
