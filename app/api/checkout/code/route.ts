import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { checkCoupon } from "@/lib/ecommerce/discounts";
import {
  CHECKOUT_CODE_MAX_LENGTH,
  CHECKOUT_CODE_RATE_LIMITED_MESSAGE,
  checkoutCodeRateLimited,
  resolveCheckoutCode,
} from "@/lib/checkout-code";
import { BOLSTER_LENGTHS } from "@/lib/results/composed-sellable";
import { resultCouponLineItems } from "@/lib/results/discount";

export const runtime = "nodejs";

/**
 * Public, anonymous: what the one code field at checkout says while the shopper
 * types (ADR 0033). It answers only what the page shows — whose referral it is,
 * or what a discount takes off — and never the coupon row (limits, scope, the
 * stored code's id). The amount is a preview worked out from the totals the page
 * sends; checkout and the hold price the order again from the database, and only
 * that is charged.
 */
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
  /** The build the code would go on: a Paired build's Mpillow, which carries it. */
  build: z.discriminatedUnion("product_type", [
    z.object({
      product_type: z.literal("pillow"),
      size: z.enum(["XS", "S", "M", "L", "XL"]),
      tier: z.enum(["basic", "premium"]),
    }),
    z.object({ product_type: z.literal("bolster"), length: z.enum(BOLSTER_LENGTHS) }),
  ]),
  /** That build's goods: Costings price + preferences + add-ons. */
  goods: z.number().nonnegative(),
});

/** Nothing priced yet (an Assisted customisation's questionnaire). */
const NoOrderContextSchema = z.object({ flow: z.literal("none") });

const CheckCodeSchema = z.object({
  code: z.string().trim().min(1).max(CHECKOUT_CODE_MAX_LENGTH),
  /** For a coupon's per-customer limit; optional until the shopper types one. */
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
    // The partner's name is the feedback; never its id.
    return NextResponse.json({ ok: true, kind: "referral", partner_name: resolved.partner.name });
  }

  const coupon = resolved.coupon;
  if (context.flow === "none") {
    // Usable at all — dates and limits — with the order-shaped rules (minimum,
    // scope) and the amount left to the hold, which prices the build.
    const usable = await checkCoupon({ ...coupon, min_order_amount: null, applies_to: null }, 0, undefined, undefined, {
      customerEmail: email,
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
            lineItems: context.line_items.map((l) => ({
              productId: l.product_id,
              categoryId: categoryById.get(l.product_id) ?? null,
              lineTotal: l.line_total,
            })),
          });
        })()
      : await checkCoupon(coupon, context.goods, undefined, undefined, {
          customerEmail: email,
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
