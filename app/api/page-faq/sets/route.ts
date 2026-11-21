import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import {
  ensurePageFaqSet,
  getPageFaqSetAdmin,
  isValidSurfaceKey,
  listPageFaqSetsAdmin,
} from "@/lib/page-faq";

export const runtime = "nodejs";

const LabelsSchema = z.object({
  "en-US": z.string().min(1),
  "zh-CN": z.string().min(1),
});

const EnsureSetSchema = z.object({
  surface_key: z.string().min(1),
  titles: LabelsSchema.optional(),
});

export async function GET(req: Request) {
  const denied = await requireAdmin("faq");
  if (denied) return denied;

  const surfaceKey = new URL(req.url).searchParams.get("surface_key");
  if (surfaceKey) {
    if (!isValidSurfaceKey(surfaceKey)) {
      return NextResponse.json({ error: "Invalid surface_key" }, { status: 400 });
    }
    const set = await getPageFaqSetAdmin(surfaceKey);
    return NextResponse.json({ ok: true, set });
  }

  const rows = await listPageFaqSetsAdmin();
  return NextResponse.json({ ok: true, rows });
}

export async function POST(req: Request) {
  const denied = await requireAdmin("faq");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = EnsureSetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  if (!isValidSurfaceKey(parsed.data.surface_key)) {
    return NextResponse.json({ error: "Invalid surface_key" }, { status: 400 });
  }

  const row = await ensurePageFaqSet(parsed.data.surface_key, parsed.data.titles);
  if (!row) {
    return NextResponse.json({ error: "Failed to ensure set" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, row });
}
