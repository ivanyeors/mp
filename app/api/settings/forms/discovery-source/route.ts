import { NextResponse } from "next/server";
import { invalidateTag } from "@/lib/cache/invalidate";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import {
  DISCOVERY_SOURCE_READ_FAILED,
  getDiscoverySourceCatalogOrThrow,
  saveDiscoverySourceCatalog,
} from "@/lib/discovery-source";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OptionSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  labels: z.object({
    "en-US": z.string().min(1).max(120),
    "zh-CN": z.string().max(120),
  }),
  active: z.boolean(),
  system: z.boolean().optional(),
});

const PutSchema = z.object({
  options: z.array(OptionSchema).min(1).max(50),
});

export async function GET() {
  const denied = await requireAdmin("forms");
  if (denied) return denied;

  try {
    const catalog = await getDiscoverySourceCatalogOrThrow();
    return NextResponse.json({ ok: true, catalog });
  } catch (err) {
    console.error("[forms] discovery source read failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: DISCOVERY_SOURCE_READ_FAILED }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const denied = await requireAdmin("forms");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = PutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const result = await saveDiscoverySourceCatalog({ options: parsed.data.options });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  invalidateTag("site-settings");
  return NextResponse.json({ ok: true, catalog: result.catalog });
}
