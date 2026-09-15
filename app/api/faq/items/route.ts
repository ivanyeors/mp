import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getAllFaqItemsAdmin } from "@/lib/faq";

export const runtime = "nodejs";

const LocaleContentSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

const CreateItemSchema = z.object({
  category_id: z.string().uuid(),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
  content: z.object({
    "en-US": LocaleContentSchema,
    "zh-CN": LocaleContentSchema,
  }),
  visible: z.boolean().optional().default(true),
});

export async function GET(req: Request) {
  const denied = await requireAdmin("page-builder");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get("category_id");

  let rows = await getAllFaqItemsAdmin();
  if (categoryId) {
    rows = rows.filter((r) => r.category_id === categoryId);
  }

  return NextResponse.json({ ok: true, rows });
}

export async function POST(req: Request) {
  const denied = await requireAdmin("page-builder");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = CreateItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: maxRow } = await admin
    .from("faq_items")
    .select("position")
    .eq("category_id", parsed.data.category_id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = (maxRow?.position ?? -1) + 1;

  const { data, error } = await admin
    .from("faq_items")
    .insert({
      category_id: parsed.data.category_id,
      slug: parsed.data.slug,
      content: parsed.data.content,
      position,
      visible: parsed.data.visible,
    })
    .select("*")
    .single();

  if (error) {
    const isDup = /duplicate key|unique/i.test(error.message);
    return NextResponse.json(
      { error: isDup ? "A question with this slug already exists" : error.message },
      { status: isDup ? 409 : 500 }
    );
  }

  return NextResponse.json({ ok: true, row: data });
}
