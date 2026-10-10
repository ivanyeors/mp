import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { reorderPageFaqItems } from "@/lib/page-faq";

export const runtime = "nodejs";

const ReorderSchema = z.object({
  set_id: z.string().uuid(),
  order: z.array(z.string().uuid()).min(1),
});

export async function PUT(req: Request) {
  const denied = await requireAdmin("faq");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = ReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const ok = await reorderPageFaqItems(parsed.data.set_id, parsed.data.order);
  if (!ok) {
    return NextResponse.json({ error: "Failed to reorder items" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
