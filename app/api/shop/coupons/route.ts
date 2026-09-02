import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { listAdminCoupons } from "@/lib/ecommerce/admin/coupons";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

const CreateCouponSchema = z.object({
  code: z.string().trim().min(1).max(100),
  discount_type: z.enum(["percentage", "fixed_amount", "free_shipping"]),
  discount_value: z.number().nonnegative(),
  currency: z.string().default("SGD"),
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
  const denied = await requireAdmin("discounts");
  if (denied) return denied;

  const { searchParams } = new URL(req.url);

  const result = await listAdminCoupons(searchParams);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const denied = await requireAdmin("discounts");
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
