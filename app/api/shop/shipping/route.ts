import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth/admin";

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

  const admin = supabaseAdmin();

  let query = admin.from("shipping_methods").select("*").order("position", { ascending: true });

  if (country) {
    query = query.contains("countries", [country]);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, rows: data ?? [] });
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
  return NextResponse.json({ ok: true, row: data });
}
