import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCartWithItems } from "@/lib/ecommerce/cart";
import { findOrCreateCustomer } from "@/lib/ecommerce/customers";
import { validateCoupon, incrementCouponUsage } from "@/lib/ecommerce/discounts";
import { calculateShippingRate, resolveShippingContent } from "@/lib/ecommerce/shipping";
import { createCheckoutSession } from "@/lib/stripe/checkout";
import type { ShippingMethod } from "@/lib/types/ecommerce";

export const runtime = "nodejs";

const CART_COOKIE = "cart_token";

const ShippingAddressSchema = z.object({
  recipient: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().optional(),
  postal_code: z.string().min(1),
  country: z.string().default("MY"),
  phone: z.string().optional(),
});

const CheckoutSchema = z.object({
  email: z.string().email(),
  phone: z.string().optional(),
  shipping_address: ShippingAddressSchema,
  shipping_method_id: z.string().uuid(),
  coupon_code: z.string().optional(),
});

export async function POST(req: Request) {
  // 1. Read cart_token from cookie
  const cookieStore = await cookies();
  const cartToken = cookieStore.get(CART_COOKIE)?.value ?? null;

  if (!cartToken) {
    return NextResponse.json({ error: "No cart found" }, { status: 400 });
  }

  // 2. Validate request body
  const body = await req.json().catch(() => null);
  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, phone, shipping_address, shipping_method_id, coupon_code } = parsed.data;

  // 3. Load cart with items
  let cart: Awaited<ReturnType<typeof getCartWithItems>>;
  try {
    cart = await getCartWithItems(cartToken);
  } catch {
    return NextResponse.json({ error: "Cart not found or expired" }, { status: 400 });
  }

  // 4. If cart empty, return 400
  if (!cart.items || cart.items.length === 0) {
    return NextResponse.json({ error: "Your cart is empty" }, { status: 400 });
  }

  const admin = supabaseAdmin();

  // 5. Validate stock via variant_stock view
  const variantIds = cart.items.map((item) => item.variant_id);
  const { data: stockRows, error: stockError } = await admin
    .from("variant_stock")
    .select("variant_id, stock_available")
    .in("variant_id", variantIds);

  if (stockError) {
    return NextResponse.json({ error: "Failed to check stock availability" }, { status: 500 });
  }

  const stockMap = new Map<string, number>(
    (stockRows ?? []).map((row: { variant_id: string; stock_available: number }) => [
      row.variant_id,
      row.stock_available,
    ])
  );

  for (const item of cart.items) {
    const available = stockMap.get(item.variant_id) ?? 0;
    if (available < item.quantity) {
      const title = item.variant?.title ?? item.variant_id;
      return NextResponse.json(
        { error: `Insufficient stock for "${title}". Only ${available} available.` },
        { status: 400 }
      );
    }
  }

  // 6. Validate all variants have stripe_price_id
  const missingStripePrice = cart.items.some((item) => !item.variant?.stripe_price_id);
  if (missingStripePrice) {
    return NextResponse.json(
      { error: "Some items are not available for online purchase" },
      { status: 400 }
    );
  }

  // 7. Calculate subtotal
  const subtotal = cart.items.reduce(
    (sum, item) => sum + item.quantity * (item.variant?.price ?? 0),
    0
  );

  // 8. Validate coupon if provided
  let discountAmount = 0;
  let couponId: string | null = null;
  let appliedCouponCode: string | null = null;
  let isFreeShipping = false;

  if (coupon_code) {
    const productIds = cart.items.map((item) => item.product?.id).filter(Boolean) as string[];
    const categoryIds = cart.items
      .map((item) => item.product?.category_id)
      .filter(Boolean) as string[];

    const couponResult = await validateCoupon(coupon_code, subtotal, productIds, categoryIds);
    if (!couponResult.valid) {
      return NextResponse.json({ error: couponResult.error ?? "Invalid coupon" }, { status: 400 });
    }
    discountAmount = couponResult.discount_amount ?? 0;
    couponId = couponResult.coupon?.id ?? null;
    appliedCouponCode = couponResult.coupon?.code ?? coupon_code.toUpperCase().trim();
    isFreeShipping = couponResult.coupon?.discount_type === "free_shipping";
  }

  // 9. Load shipping method and calculate shipping rate
  const { data: shippingMethodRow, error: shippingError } = await admin
    .from("shipping_methods")
    .select("*")
    .eq("id", shipping_method_id)
    .eq("is_active", true)
    .single();

  if (shippingError || !shippingMethodRow) {
    return NextResponse.json({ error: "Invalid or unavailable shipping method" }, { status: 400 });
  }

  const shippingMethod = shippingMethodRow as ShippingMethod;
  const shippingAmount = isFreeShipping ? 0 : calculateShippingRate(shippingMethod, subtotal);
  const shippingLabel = resolveShippingContent(shippingMethod).name;

  // 10. Calculate total
  const total = Math.max(0, subtotal - discountAmount + shippingAmount);

  // 11. Find or create customer
  const customer = await findOrCreateCustomer(email, { phone: phone ?? undefined });

  // 12. Create order in DB
  const { data: orderRow, error: orderError } = await admin
    .from("orders")
    .insert({
      customer_id: customer.id,
      email: email.toLowerCase().trim(),
      phone: phone ?? null,
      status: "pending",
      currency: cart.currency ?? "MYR",
      subtotal,
      shipping_amount: shippingAmount,
      tax_amount: 0,
      discount_amount: discountAmount,
      total,
      shipping_address: shipping_address,
      shipping_method_id,
      coupon_id: couponId,
      coupon_code: appliedCouponCode,
      payment_method: "stripe",
    })
    .select("id, order_number")
    .single();

  if (orderError || !orderRow) {
    return NextResponse.json(
      { error: orderError?.message ?? "Failed to create order" },
      { status: 500 }
    );
  }

  // 13. Create order_items from cart items
  const orderItems = cart.items.map((item) => ({
    order_id: orderRow.id,
    variant_id: item.variant_id,
    sku: item.variant?.sku ?? "",
    product_title:
      Object.values(item.product?.content ?? {})[0]?.title ?? item.product?.slug ?? "",
    variant_title: item.variant?.title ?? null,
    image_url: item.variant?.image_url ?? null,
    quantity: item.quantity,
    unit_price: item.variant?.price ?? 0,
    total_price: item.quantity * (item.variant?.price ?? 0),
  }));

  const { error: itemsError } = await admin.from("order_items").insert(orderItems);
  if (itemsError) {
    // Attempt to clean up the orphaned order
    await admin.from("orders").delete().eq("id", orderRow.id);
    return NextResponse.json({ error: "Failed to create order items" }, { status: 500 });
  }

  // 14. Create Stripe Checkout Session
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  let stripeSession: { sessionId: string; url: string | null };
  try {
    stripeSession = await createCheckoutSession({
      lineItems: cart.items.map((item) => ({
        variant: item.variant!,
        quantity: item.quantity,
      })),
      customerEmail: email,
      orderId: orderRow.id,
      orderNumber: orderRow.order_number,
      successUrl: `${siteUrl}/shop/order/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${siteUrl}/shop/checkout`,
      shippingAmount,
      shippingLabel,
    });
  } catch (err) {
    // Clean up orphaned order and items on Stripe failure
    await admin.from("order_items").delete().eq("order_id", orderRow.id);
    await admin.from("orders").delete().eq("id", orderRow.id);
    const message = err instanceof Error ? err.message : "Failed to create payment session";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  // Persist stripe_session_id on the order
  await admin
    .from("orders")
    .update({ stripe_session_id: stripeSession.sessionId })
    .eq("id", orderRow.id);

  // Increment coupon usage if applicable
  if (couponId) {
    await incrementCouponUsage(couponId);
  }

  // 15. Return checkout URL and order number
  return NextResponse.json({
    ok: true,
    checkout_url: stripeSession.url,
    order_number: orderRow.order_number,
  });
}
