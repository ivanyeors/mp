import { after, NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAdminProduct } from "@/lib/ecommerce/admin/products";
import { requireAdmin } from "@/lib/auth/admin";
import { syncProductToStripeSafe } from "@/lib/stripe/sync";
import { stripeProductIdColumn } from "@/lib/stripe/mode";
import { pingIndexNow, productUrls } from "@/lib/seo/indexnow";

export const runtime = "nodejs";

const UpdateProductSchema = z.object({
  slug: z.string().trim().min(1).max(300).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  product_type: z.enum(["pillow", "bolster", "accessory", "bundle"]).optional(),
  status: z.enum(["draft", "active", "archived"]).optional(),
  content: z.record(z.string(), z.object({
    title: z.string().min(1),
    description: z.string().optional().default(""),
    body: z.string().optional().default(""),
    seo_title: z.string().optional().default(""),
    seo_description: z.string().optional().default(""),
    seo_answer: z.string().optional().default(""),
    seo_keywords: z.array(z.string()).optional().default([]),
  })).optional(),
  category_id: z.string().uuid().nullable().optional(),
  featured: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
}).partial();

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("products");
  if (denied) return denied;

  const { id } = await params;

  const result = await getAdminProduct(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true, row: result.row });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("products");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateProductSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const update: Record<string, unknown> = { ...parsed.data };

  if (parsed.data.status === "active") {
    const { data: existing } = await admin.from("products").select("published_at").eq("id", id).single();
    if (existing && !existing.published_at) {
      update.published_at = new Date().toISOString();
    }
  }

  const { data, error } = await admin.from("products").update(update).eq("id", id).select("*").single();
  if (error) {
    const isDup = /duplicate key|unique/i.test(error.message);
    return NextResponse.json(
      { error: isDup ? "A product with this slug already exists" : error.message },
      { status: isDup ? 409 : 500 }
    );
  }

  const stripe = data.status === "active" ? await syncProductToStripeSafe(id) : undefined;

  if (data.status === "active" || parsed.data.status) after(() => pingIndexNow(productUrls(data.slug)));

  const row = stripe?.result
    ? { ...data, [stripeProductIdColumn()]: stripe.result.stripeProductId }
    : data;

  return NextResponse.json({
    ok: true,
    row,
    stripe: stripe && {
      synced: stripe.synced,
      error: stripe.error,
      pricesInPlace: stripe.pricesInPlace,
      notices: stripe.notices,
      paymentLinkCleared: stripe.paymentLinkCleared,
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("products");
  if (denied) return denied;

  const { id } = await params;
  const admin = supabaseAdmin();
  const { error } = await admin.from("products").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
