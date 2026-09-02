import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAdminContext, requireAdmin } from "@/lib/auth/admin";
import { roleHasPermission } from "@/lib/auth/permissions";
import { readShippingMethods } from "@/lib/shop/shipping-methods";

export const runtime = "nodejs";

const CreateShippingMethodSchema = z.object({
  slug: z.string().trim().min(1).max(200).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  content: z.record(z.string(), z.unknown()).default({}),
  base_rate: z.number().nonnegative(),
  free_above: z.number().nonnegative().nullable().optional().default(null),
  currency: z.string().default("SGD"),
  countries: z.array(z.string()).optional().default(["SG"]),
  is_active: z.boolean().optional().default(true),
  position: z.number().int().nonnegative().optional().default(0),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const country = searchParams.get("country");
  const includeInactive = searchParams.get("include_inactive") === "1";
  const adminCtx = includeInactive ? await getAdminContext() : null;
  const canIncludeInactive =
    adminCtx != null && roleHasPermission(adminCtx.role, "shipping");

  try {
    const rows = await readShippingMethods(canIncludeInactive, country);
    return NextResponse.json({ ok: true, rows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const denied = await requireAdmin("shipping");
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = CreateShippingMethodSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();

  const { data, error } = await admin.from("shipping_methods").insert(parsed.data).select("*").single();
  if (error) {
    const isDup = /duplicate key|unique/i.test(error.message);
    return NextResponse.json(
      { error: isDup ? "A shipping method with this slug already exists" : error.message },
      { status: isDup ? 409 : 500 }
    );
  }
  revalidateTag("shipping-methods", "max");
  return NextResponse.json({ ok: true, row: data });
}
