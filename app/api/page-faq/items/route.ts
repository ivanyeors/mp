import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { createPageFaqItem, getPageFaqSetAdmin, isValidSurfaceKey } from "@/lib/page-faq";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

const LocaleContentSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

const CreateItemSchema = z.object({
  set_id: z.string().uuid().optional(),
  surface_key: z.string().optional(),
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
  const setId = searchParams.get("set_id");
  const surfaceKey = searchParams.get("surface_key");

  if (surfaceKey) {
    if (!isValidSurfaceKey(surfaceKey)) {
      return NextResponse.json({ error: "Invalid surface_key" }, { status: 400 });
    }
    const set = await getPageFaqSetAdmin(surfaceKey);
    return NextResponse.json({ ok: true, rows: set?.items ?? [] });
  }

  if (!setId) {
    return NextResponse.json({ error: "set_id or surface_key required" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("faq_page_items")
    .select("*")
    .eq("set_id", setId)
    .order("position", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, rows: data ?? [] });
}

export async function POST(req: Request) {
  const denied = await requireAdmin("page-builder");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = CreateItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  let setId = parsed.data.set_id;
  if (!setId && parsed.data.surface_key) {
    if (!isValidSurfaceKey(parsed.data.surface_key)) {
      return NextResponse.json({ error: "Invalid surface_key" }, { status: 400 });
    }
    const set = await getPageFaqSetAdmin(parsed.data.surface_key);
    setId = set?.id;
  }
  if (!setId) {
    return NextResponse.json({ error: "set_id or surface_key required" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: maxRow } = await admin
    .from("faq_page_items")
    .select("position")
    .eq("set_id", setId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();

  const position = (maxRow?.position ?? -1) + 1;

  const row = await createPageFaqItem({
    setId,
    slug: parsed.data.slug,
    content: parsed.data.content,
    position,
    visible: parsed.data.visible,
  });

  if (!row) {
    return NextResponse.json({ error: "Failed to create item (slug may be duplicate)" }, { status: 409 });
  }
  return NextResponse.json({ ok: true, row });
}
