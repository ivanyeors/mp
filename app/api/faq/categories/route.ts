import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { getAllFaqCategoriesAdmin } from "@/lib/faq";

export const runtime = "nodejs";

const LabelsSchema = z.object({
  "en-US": z.string().min(1),
  "zh-CN": z.string().min(1),
});

const CreateCategorySchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "Key must be lowercase alphanumeric with hyphens"),
  labels: LabelsSchema,
  visible: z.boolean().optional().default(true),
});

export async function GET() {
  const rows = await getAllFaqCategoriesAdmin();
  return NextResponse.json({ ok: true, rows });
}

export async function POST(req: Request) {
  const denied = await requireAdmin("page-builder");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = CreateCategorySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: maxRow } = await admin
    .from("faq_categories")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = (maxRow?.position ?? -1) + 1;

  const { data, error } = await admin
    .from("faq_categories")
    .insert({
      key: parsed.data.key,
      labels: parsed.data.labels,
      position,
      visible: parsed.data.visible,
    })
    .select("*")
    .single();

  if (error) {
    const isDup = /duplicate key|unique/i.test(error.message);
    return NextResponse.json(
      { error: isDup ? "A category with this key already exists" : error.message },
      { status: isDup ? 409 : 500 }
    );
  }

  return NextResponse.json({ ok: true, row: data });
}
