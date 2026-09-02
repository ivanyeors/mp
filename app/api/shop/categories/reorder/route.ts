import { NextResponse } from "next/server";
import { invalidateTag } from "@/lib/cache/invalidate";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

const ReorderCategoriesSchema = z.object({
  positions: z.array(
    z.object({
      id: z.string().uuid(),
      position: z.number().int().nonnegative(),
    })
  ).min(1),
});

export async function PUT(req: Request) {
  const denied = await requireAdmin("categories");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = ReorderCategoriesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const updates = await Promise.all(
    parsed.data.positions.map(({ id, position }) =>
      admin
        .from("categories")
        .update({ position })
        .eq("id", id)
        .select("id, position")
        .single()
    )
  );

  const firstError = updates.find((r) => r.error);
  if (firstError?.error) {
    return NextResponse.json({ error: firstError.error.message }, { status: 500 });
  }

  invalidateTag("categories");
  return NextResponse.json({
    ok: true,
    rows: updates.map((r) => r.data),
  });
}
