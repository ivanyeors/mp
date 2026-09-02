import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { loadMpConfigResponseDetail } from "@/lib/results/admin/response-detail";

export const runtime = "nodejs";

const ParamsSchema = z.object({ id: z.string().uuid() });

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsedParams = ParamsSchema.safeParse({ id });
  if (!parsedParams.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const result = await loadMpConfigResponseDetail(parsedParams.data.id);

  return NextResponse.json(result.body, { status: result.status });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsedParams = ParamsSchema.safeParse({ id });
  if (!parsedParams.success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const admin = supabaseAdmin();
  const { error } = await admin.from("mp_config_responses").delete().eq("id", parsedParams.data.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
