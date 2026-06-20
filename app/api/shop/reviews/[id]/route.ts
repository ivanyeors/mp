import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSettingsAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

const UpdateReviewSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  author_name: z.string().trim().min(1).max(200).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  title: z.string().trim().max(300).nullable().optional(),
  body: z.string().trim().nullable().optional(),
}).partial();

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSettingsAuth();
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateReviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("reviews")
    .update(parsed.data)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, row: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireSettingsAuth();
  if (denied) return denied;

  const { id } = await params;
  const admin = supabaseAdmin();
  const { error } = await admin.from("reviews").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
