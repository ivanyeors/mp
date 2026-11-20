import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAdminCoupon } from "@/lib/ecommerce/admin/coupons";
import { requireAdmin } from "@/lib/auth/admin";
import { isReferralCodeTaken } from "@/lib/referrals";

export const runtime = "nodejs";

const UpdateCouponSchema = z.object({
  code: z.string().trim().min(1).max(100).optional(),
  discount_type: z.enum(["percentage", "fixed_amount", "free_shipping"]).optional(),
  discount_value: z.number().nonnegative().optional(),
  currency: z.string().optional(),
  min_order_amount: z.number().nonnegative().nullable().optional(),
  max_discount: z.number().nonnegative().nullable().optional(),
  usage_limit: z.number().int().positive().nullable().optional(),
  per_customer_limit: z.number().int().positive().nullable().optional(),
  starts_at: z.string().datetime({ offset: true }).nullable().optional(),
  expires_at: z.string().datetime({ offset: true }).nullable().optional(),
  applies_to: z.record(z.string(), z.unknown()).nullable().optional(),
  is_active: z.boolean().optional(),
}).partial();

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("discounts");
  if (denied) return denied;

  const { id } = await params;

  const result = await getAdminCoupon(id);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 404 });
  return NextResponse.json({ ok: true, row: result.row });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("discounts");
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = UpdateCouponSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const update: Record<string, unknown> = { ...parsed.data };
  if (typeof update.code === "string") {
    update.code = (update.code as string).toUpperCase();
    if (await isReferralCodeTaken(update.code as string)) {
      return NextResponse.json({ error: "This code is a partner's referral code. Choose another." }, { status: 409 });
    }
  }

  const { data, error } = await admin.from("coupons").update(update).eq("id", id).select("*").single();
  if (error) {
    const isDup = /duplicate key|unique/i.test(error.message);
    return NextResponse.json(
      { error: isDup ? "A coupon with this code already exists" : error.message },
      { status: isDup ? 409 : 500 }
    );
  }
  return NextResponse.json({ ok: true, row: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdmin("discounts");
  if (denied) return denied;

  const { id } = await params;
  const admin = supabaseAdmin();
  const { error } = await admin.from("coupons").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
