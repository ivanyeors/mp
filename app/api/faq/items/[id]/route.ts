import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

const LocaleContentSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

const PatchItemSchema = z.object({
  category_id: z.string().uuid().optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/)
    .optional(),
  content: z
    .object({
      "en-US": LocaleContentSchema,
      "zh-CN": LocaleContentSchema,
    })
    .optional(),
  visible: z.boolean().optional(),
  position: z.number().int().min(0).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: RouteContext) {
  const denied = await requireAdmin("page-builder");
  if (denied) return denied;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = PatchItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("faq_items")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, row: data });
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const denied = await requireAdmin("page-builder");
  if (denied) return denied;

  const { id } = await ctx.params;
  const admin = supabaseAdmin();
  const { error } = await admin.from("faq_items").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
