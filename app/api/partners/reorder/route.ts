import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod/v4";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

const ReorderSchema = z.object({
  order: z.array(z.string().uuid()).min(1),
});

export async function PUT(req: Request) {
  const denied = await requireAdmin("page-builder");
  if (denied) return denied;

  try {
    const body = await req.json();
    const { order } = ReorderSchema.parse(body);
    const admin = supabaseAdmin();

    const updates = order.map((id, index) =>
      admin
        .from("partners")
        .update({ position: index, updated_at: new Date().toISOString() })
        .eq("id", id),
    );

    const results = await Promise.all(updates);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      return NextResponse.json({ error: failed.error.message }, { status: 500 });
    }

    revalidateTag("locations", "max");
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
