import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { validateCoupon } from "@/lib/ecommerce/discounts";
import { getCurrentCustomerId } from "@/lib/shop/customer-addresses";

export const runtime = "nodejs";

const ValidateCouponSchema = z.object({
  code: z.string().trim().min(1),
  subtotal: z.number().nonnegative(),
  product_ids: z.array(z.string().uuid()).optional(),
  category_ids: z.array(z.string().uuid()).optional(),
  email: z.string().email().optional(),
  // No customer_id: who is buying comes from the session, never the body
  // (ADR 0029 g). A stale client still sending one has it stripped by zod.
  line_items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        category_id: z.string().uuid().nullable().optional(),
        line_total: z.number().nonnegative(),
      })
    )
    .optional(),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = ValidateCouponSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { code, subtotal, product_ids, email, line_items } = parsed.data;
  let { category_ids } = parsed.data;

  // Enrich category IDs from products when not supplied (cart only has productId).
  if (product_ids?.length && !category_ids?.length) {
    const admin = supabaseAdmin();
    const { data: products } = await admin
      .from("products")
      .select("category_id")
      .in("id", product_ids);
    category_ids = [
      ...new Set(
        (products ?? [])
          .map((p: { category_id: string | null }) => p.category_id)
          .filter((id): id is string => Boolean(id))
      ),
    ];
  }

  const result = await validateCoupon(code, subtotal, product_ids, category_ids, {
    customerEmail: email,
    getSessionCustomerId: getCurrentCustomerId,
    lineItems: line_items?.map((item) => ({
      productId: item.product_id,
      categoryId: item.category_id,
      lineTotal: item.line_total,
    })),
  });

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
    // Public endpoint: never hand back the coupon row (limits, scope, other codes).
    free_shipping: result.coupon?.discount_type === "free_shipping",
  });
}
