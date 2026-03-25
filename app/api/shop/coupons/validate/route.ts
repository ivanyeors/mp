import { NextResponse } from "next/server";
import { z } from "zod";
import { validateCoupon } from "@/lib/ecommerce/discounts";

export const runtime = "nodejs";

const ValidateCouponSchema = z.object({
  code: z.string().trim().min(1),
  subtotal: z.number().nonnegative(),
  product_ids: z.array(z.string().uuid()).optional(),
  category_ids: z.array(z.string().uuid()).optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = ValidateCouponSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { code, subtotal, product_ids, category_ids } = parsed.data;

  const result = await validateCoupon(code, subtotal, product_ids, category_ids);

  if (!result.valid) {
    return NextResponse.json({
      ok: true,
      valid: false,
      reason: result.error ?? "Invalid coupon",
    });
  }

  return NextResponse.json({
    ok: true,
    valid: true,
    discount_amount: result.discount_amount,
    coupon: result.coupon,
  });
}
