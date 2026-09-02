import { NextResponse } from "next/server";
import { invalidateTag } from "@/lib/cache/invalidate";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { saveDiscoverySourceCatalog } from "@/lib/discovery-source";
import { readDiscoverySourceCatalog } from "@/lib/discovery-source/cached";

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

/** Admin: full catalog including archived. */
export async function GET() {
  const denied = await requireAdmin("page-builder");
  if (denied) return denied;

  const catalog = await readDiscoverySourceCatalog();
  return NextResponse.json({ ok: true, catalog });
}

/** Admin: replace catalog (Other lock enforced in lib). */
export async function PUT(req: Request) {
  const denied = await requireAdmin("page-builder");
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
