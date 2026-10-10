import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { updatePageFaqSet } from "@/lib/page-faq";

export const runtime = "nodejs";

const LabelsSchema = z.object({
  "en-US": z.string().min(1),
  "zh-CN": z.string().min(1),
});

const PatchSetSchema = z.object({
  titles: LabelsSchema.optional(),
  visible: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: RouteContext) {
  const denied = await requireAdmin("faq");
  if (denied) return denied;

  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = PatchSetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const row = await updatePageFaqSet(id, parsed.data);
  if (!row) {
    return NextResponse.json({ error: "Set not found or update failed" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, row });
}
