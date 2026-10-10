import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { deletePageFaqItem, updatePageFaqItem } from "@/lib/page-faq";

export const runtime = "nodejs";

const LocaleContentSchema = z.object({
  question: z.string().min(1),
  answer: z.string().min(1),
});

const PatchItemSchema = z.object({
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
  const denied = await requireAdmin("faq");
  if (denied) return denied;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = PatchItemSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const row = await updatePageFaqItem(id, parsed.data);
  if (!row) {
    return NextResponse.json({ error: "Item not found or update failed" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, row });
}

export async function DELETE(_req: Request, ctx: RouteContext) {
  const denied = await requireAdmin("faq");
  if (denied) return denied;

  const { id } = await ctx.params;
  const ok = await deletePageFaqItem(id);
  if (!ok) {
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
