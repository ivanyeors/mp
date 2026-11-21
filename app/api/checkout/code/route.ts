import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { checkCoupon } from "@/lib/ecommerce/discounts";
import {
  CHECKOUT_CODE_MAX_LENGTH,
  CHECKOUT_CODE_RATE_LIMITED_MESSAGE,
  checkoutCodeRateLimited,
  couponAccount,
  resolveCheckoutCode,
} from "@/lib/checkout-code";
import { BOLSTER_LENGTHS } from "@/lib/results/composed-sellable";
import { resultCouponLineItems } from "@/lib/results/discount";
import { getPartnerContext } from "@/lib/auth/partner";
import { isSelfReferral } from "@/lib/referrals";
import { referralDiscountFor, sgtDate } from "@/lib/partner-terms";

export const runtime = "nodejs";

const ShopContextSchema = z.object({
  flow: z.literal("shop"),
  subtotal: z.number().nonnegative(),
  line_items: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        line_total: z.number().nonnegative(),
      }),
    )
    .max(100)
    .default([]),
});

const CustomisationContextSchema = z.object({
  flow: z.literal("customisation"),
  build: z.discriminatedUnion("product_type", [
    z.object({
      product_type: z.literal("pillow"),
      size: z.enum(["XS", "S", "M", "L", "XL"]),
      tier: z.enum(["basic", "premium"]),
    }),
    z.object({ product_type: z.literal("bolster"), length: z.enum(BOLSTER_LENGTHS) }),
  ]),
  goods: z.number().nonnegative(),
});

const NoOrderContextSchema = z.object({ flow: z.literal("none") });

const CheckCodeSchema = z.object({
  code: z.string().trim().min(1).max(CHECKOUT_CODE_MAX_LENGTH),
  email: z.string().trim().email().optional().catch(undefined),
  context: z.discriminatedUnion("flow", [ShopContextSchema, CustomisationContextSchema, NoOrderContextSchema]),
});

export async function POST(req: Request) {
  if (await checkoutCodeRateLimited(req)) {
    return NextResponse.json({ error: CHECKOUT_CODE_RATE_LIMITED_MESSAGE }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CheckCodeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { code, email, context } = parsed.data;

  const resolved = await resolveCheckoutCode(code);
  if (!resolved || resolved.kind === "unknown") {
    return NextResponse.json({ ok: true, kind: "unknown" });
  }
  if (resolved.kind === "referral") {
    const partner = resolved.partner;
    let discount = 0;
    if (context.flow === "customisation") {
      const build =
        context.build.product_type === "pillow"
          ? { productType: "pillow", tier: context.build.tier }
          : { productType: "bolster" };
      discount = Math.min(context.goods, referralDiscountFor(partner.terms, build, sgtDate(new Date())));
      if (discount > 0) {
        const session = await getPartnerContext();
        if (await isSelfReferral(partner.id, { sessionPartnerId: session?.partnerId, email })) discount = 0;
      }
    }
    return NextResponse.json({ ok: true, kind: "referral", partner_name: partner.name, discount_amount: discount });
  }

  const coupon = resolved.coupon;
  const account = await couponAccount(coupon);
  if (context.flow === "none") {
    const usable = await checkCoupon({ ...coupon, min_order_amount: null, applies_to: null }, 0, undefined, undefined, {
      customerEmail: email,
      account,
    });
    return usable.valid
      ? NextResponse.json({
          ok: true,
          kind: "discount",
          code: coupon.code,
          discount_amount: null,
          free_shipping: coupon.discount_type === "free_shipping",
        })
      : NextResponse.json({ ok: true, kind: "invalid", reason: usable.error ?? "This code can't be used" });
  }
  const result =
    context.flow === "shop"
      ? await (async () => {
          const productIds = [...new Set(context.line_items.map((l) => l.product_id))];
          let categoryById = new Map<string, string | null>();
          if (productIds.length > 0) {
            const { data: products } = await supabaseAdmin()
              .from("products")
              .select("id, category_id")
              .in("id", productIds);
            categoryById = new Map(
              (products ?? []).map((p: { id: string; category_id: string | null }) => [p.id, p.category_id]),
            );
          }
          const categoryIds = [
            ...new Set([...categoryById.values()].filter((id): id is string => Boolean(id))),
          ];
          return checkCoupon(coupon, context.subtotal, productIds, categoryIds, {
            customerEmail: email,
      account,
            lineItems: context.line_items.map((l) => ({
              productId: l.product_id,
              categoryId: categoryById.get(l.product_id) ?? null,
              lineTotal: l.line_total,
            })),
          });
        })()
      : await checkCoupon(coupon, context.goods, undefined, undefined, {
          customerEmail: email,
      account,
          lineItems: await resultCouponLineItems(
            supabaseAdmin(),
            context.build.product_type === "pillow"
              ? { productType: "pillow", size: context.build.size, tier: context.build.tier }
              : { productType: "bolster", length: context.build.length },
            context.goods,
            coupon.applies_to,
          ),
        });

  if (!result.valid) {
    return NextResponse.json({ ok: true, kind: "invalid", reason: result.error ?? "This code can't be used" });
  }
  return NextResponse.json({
    ok: true,
    kind: "discount",
    code: coupon.code,
    discount_amount: result.discount_amount ?? 0,
    free_shipping: coupon.discount_type === "free_shipping",
  });
}
