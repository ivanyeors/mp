import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";
import { BOLSTER_LENGTHS } from "@/lib/results/composed-sellable";
import { loadAssignPrep } from "@/lib/results/assign-prep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PILLOW_SIZES = ["XS", "S", "M", "L", "XL"] as const;

const PrepQuerySchema = z.union([
  z.object({
    productType: z.literal("pillow"),
    size: z.enum(PILLOW_SIZES),
    tier: z.enum(["basic", "premium"]),
    preferredTemplateId: z.coerce.number().int().positive().optional(),
    hintSource: z.enum(["engine", "default"]).optional(),
  }),
  z.object({
    productType: z.literal("bolster"),
    length: z.enum(BOLSTER_LENGTHS),
    preferredTemplateId: z.coerce.number().int().positive().optional(),
    hintSource: z.enum(["engine", "default"]).optional(),
  }),
]);

export async function GET(req: Request) {
  const denied = await requireAdmin("results");
  if (denied) return denied;

  const url = new URL(req.url);
  const preferredRaw = url.searchParams.get("preferredTemplateId");
  const raw = {
    productType: url.searchParams.get("productType"),
    size: url.searchParams.get("size") ?? undefined,
    tier: url.searchParams.get("tier") ?? undefined,
    length: url.searchParams.get("length") ?? undefined,
    preferredTemplateId: preferredRaw ?? undefined,
    hintSource: url.searchParams.get("hintSource") ?? undefined,
  };
  const parsed = PrepQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const key =
    parsed.data.productType === "pillow"
      ? { productType: "pillow" as const, size: parsed.data.size, tier: parsed.data.tier }
      : { productType: "bolster" as const, length: parsed.data.length };

  const result = await loadAssignPrep(admin, key, {
    preferredTemplateId: parsed.data.preferredTemplateId ?? null,
    hintSource: parsed.data.hintSource,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result.prep);
}
