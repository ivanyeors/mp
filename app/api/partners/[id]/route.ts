import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

const UpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  logo_url: z.string().nullable().optional(),
  website_url: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  visible: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: RouteParams) {
  const denied = await requireAdmin("page-builder");
  if (denied) return denied;

  const { id } = await params;

  try {
    const body = await req.json();
    const parsed = UpdateSchema.parse(body);
    const admin = supabaseAdmin();

    const { data, error } = await admin
      .from("partners")
      .update(parsed)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ ok: true, partner: data });
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

export async function DELETE(_req: Request, { params }: RouteParams) {
  const denied = await requireAdmin("page-builder");
  if (denied) return denied;

  const { id } = await params;
  const admin = supabaseAdmin();

  const { error } = await admin.from("partners").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
