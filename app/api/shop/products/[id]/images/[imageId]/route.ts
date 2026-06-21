import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; imageId: string }> }) {
  const denied = await requireAdmin("products");
  if (denied) return denied;

  const { imageId } = await params;
  const admin = supabaseAdmin();
  const { error } = await admin.from("product_images").delete().eq("id", imageId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
