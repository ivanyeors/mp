import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { requireSettingsAuth } from "@/lib/api-auth";

export const runtime = "nodejs";

const CreateCouponSchema = z.object({
  code: z.string().trim().min(1).max(100),
  discount_type: z.enum(["percentage", "fixed_amount", "free_shipping"]),
  discount_value: z.number().nonnegative(),
  currency: z.string().default("MYR"),
  min_order_amount: z.number().nonnegative().nullable().optional().default(null),
  max_discount: z.number().nonnegative().nullable().optional().default(null),
  usage_limit: z.number().int().positive().nullable().optional().default(null),
  per_customer_limit: z.number().int().positive().optional().default(1),
  starts_at: z.string().datetime({ offset: true }).nullable().optional().default(null),
  expires_at: z.string().datetime({ offset: true }).nullable().optional().default(null),
  applies_to: z.record(z.string(), z.unknown()).nullable().optional().default(null),
  is_active: z.boolean().optional().default(true),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const active = searchParams.get("active");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);

  const admin = supabaseAdmin();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = admin.from("coupons").select("*", { count: "exact" });

  if (active === "true") query = query.eq("is_active", true);
  if (active === "false") query = query.eq("is_active", false);

  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, rows: data ?? [], total: count ?? 0, page, limit });
}

export async function POST(req: Request) {
  const denied = await requireSettingsAuth();
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  const parsed = CreateCouponSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const row = {
    ...parsed.data,
    code: parsed.data.code.toUpperCase(),
    usage_count: 0,
  };

  const { data, error } = await admin.from("coupons").insert(row).select("*").single();
  if (error) {
    const isDup = /duplicate key|unique/i.test(error.message);
    return NextResponse.json(
      { error: isDup ? "A coupon with this code already exists" : error.message },
      { status: isDup ? 409 : 500 }
    );
  }
  return NextResponse.json({ ok: true, row: data });
}
