import { NextResponse } from "next/server";
import { clientIp, tooManyRequests } from "@/lib/rate-limit";
import { cookies } from "next/headers";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { findCustomerByEmail, findOrCreateCustomer } from "@/lib/ecommerce/customers";
import { recordCheckoutConsent } from "@/lib/marketing-consent/consent";
import { checkCoupon, findActiveCoupon } from "@/lib/ecommerce/discounts";
import {
  CHECKOUT_CODE_MAX_LENGTH,
  CHECKOUT_CODE_RATE_LIMITED_MESSAGE,
  checkoutCodeRateLimited,
  couponAccount,
  resolveCheckoutCode,
} from "@/lib/checkout-code";
import { getCurrentCustomerId } from "@/lib/shop/customer-addresses";
import { getPartnerByReferralCode, isSelfReferral } from "@/lib/referrals";
import { getPartnerContext, isPartnerActive } from "@/lib/auth/partner";
import { stitchShopperVisitor } from "@/lib/analytics/journey/stitch-server";
import { computeSelfPurchaseDiscount } from "@/lib/partner-self-purchase";
import { loadSelfPurchaseAllowance } from "@/lib/partner-self-purchase/allowance";
import { calculateShippingRate, resolveShippingContent } from "@/lib/ecommerce/shipping";
import { toShippableLine } from "@/lib/shipping/lines";
import { quoteShippingMethods } from "@/lib/shipping/quote";
import { readShippingSettings } from "@/lib/shipping/settings";
import { usesPostalCode } from "@/lib/shipping/countries";
import { computeTax, computeOrderTotal, resolveTaxRuleForRegion } from "@/lib/ecommerce/tax";
import { createCheckoutSession } from "@/lib/stripe/checkout";
import { resolvePaymentUi } from "@/lib/stripe/payment-ui";
import { stripePriceIdOf } from "@/lib/stripe/mode";
import {
  buildCheckoutCustomizationSnapshot,
  resolveCustomizationProductType,
} from "@/lib/ecommerce/customization-product-type";
import { orderLinesCosts } from "@/lib/ecommerce/order-line-cost";
import { validateCustomizationConfig } from "@/lib/shop/customization-inventory";
import { quoteCustomization } from "@/lib/shop/customization-quote";
import type { ComposedSellableKey } from "@/lib/results/composed-sellable";
import { DEFAULT_LOCALE, isSupportedLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locales";
import { readPointsBalance, readPointsSettings } from "@/lib/points/server";
import type { PointsSettings } from "@/lib/points/settings";
import {
  POINTS_ACCOUNT_ERROR,
  POINTS_DISABLED_ERROR,
  POINTS_PARTNER_ERROR,
  mayUseAccountValue,
  releasePoints,
  reservePoints,
  reserveRefusalMessage,
  validatePointsRequest,
  withPointsLabel,
} from "@/lib/points/spend";
import type { BolsterVariant, ConfigLine, CustomizationProductType, FillingLine } from "@/lib/types/customization";
import type { Product, ProductVariant, ShippingMethod } from "@/lib/types/ecommerce";
import { isSelfCollect, methodDeliversTo } from "@/lib/shipping/self-collect";

type CustomizationConfigRow = {
  config_lines: unknown[];
  filling_lines: unknown[];
  total_addon_price: number;
  summary: string | null;
  pillow_product_id: number | null;
  ecom_product_id: string | null;
  product_type: CustomizationProductType | null;
  bolster_variant: BolsterVariant | null;
};

export const runtime = "nodejs";

const CART_COOKIE = "cart_token";

const ShippingAddressSchema = z.object({
  recipient: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().optional(),
  postal_code: z.string().trim().default(""),
  country: z.string().default("SG"),
  phone: z.string().optional(),
}).refine((a) => !usesPostalCode(a.country) || a.postal_code.length > 0, {
  message: "Postal code is required",
  path: ["postal_code"],
});

const CheckoutItemSchema = z.object({
  variant_id: z.string().uuid(),
  quantity: z.number().int().min(1),
  customization_id: z.string().uuid().optional(),
});

const CheckoutSchema = z.object({
  email: z.string().email(),
  phone: z.string().optional(),
  marketing_email: z.boolean().optional(),
  shipping_address: ShippingAddressSchema,
  shipping_method_id: z.string().uuid(),
  code: z.string().trim().max(CHECKOUT_CODE_MAX_LENGTH).optional(),
  coupon_code: z.string().optional(),
  referral_code: z.string().optional(),
  points: z.number().optional(),
  payment_ui: z.enum(["hosted", "elements"]).optional(),
  items: z.array(CheckoutItemSchema).min(1),
});

type WorkingItem = {
  variant_id: string;
  quantity: number;
  customization_id: string | null;
  variant: ProductVariant;
  product: Product | undefined;
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const limited = await tooManyRequests([
    { bucket: "checkout-ip", key: clientIp(req), windowMs: 10 * 60_000, max: 30 },
  ]);
  if (limited) return limited;

  const { email, phone, shipping_address, shipping_method_id, code, coupon_code, referral_code, items } =
    parsed.data;
  const pointsRequested = parsed.data.points != null && parsed.data.points !== 0;

  if ((code || coupon_code?.trim()) && (await checkoutCodeRateLimited(req))) {
    return NextResponse.json({ error: CHECKOUT_CODE_RATE_LIMITED_MESSAGE }, { status: 429 });
  }

  const admin = supabaseAdmin();

  const cookieStore = await cookies();
  const cartToken = cookieStore.get(CART_COOKIE)?.value ?? null;

  const localeCookie = cookieStore.get(LOCALE_COOKIE_NAME)?.value ?? "";
  const locale = isSupportedLocale(localeCookie) ? localeCookie : DEFAULT_LOCALE;

  const requestedVariantIds = [...new Set(items.map((i) => i.variant_id))];
  const { data: variantRows, error: variantError } = await admin
    .from("product_variants")
    .select("*, products(*)")
    .in("id", requestedVariantIds);

  if (variantError) {
    return NextResponse.json({ error: "Failed to load products" }, { status: 500 });
  }

  const variantMap = new Map<string, ProductVariant & { products?: Product }>(
    (variantRows ?? []).map((row: ProductVariant & { products?: Product }) => [row.id, row])
  );

  const cartItems: WorkingItem[] = [];
  for (const item of items) {
    const variant = variantMap.get(item.variant_id);
    if (!variant) {
      return NextResponse.json(
        { error: "One or more items are no longer available" },
        { status: 400 }
      );
    }
    if (variant.is_active === false) {
      return NextResponse.json(
        { error: "One or more items are no longer available" },
        { status: 400 }
      );
    }
    const { products, ...variantOnly } = variant;
    cartItems.push({
      variant_id: item.variant_id,
      quantity: item.quantity,
      customization_id: item.customization_id ?? null,
      variant: variantOnly as ProductVariant,
      product: products,
    });
  }

  const cartCurrency = cartItems[0]?.variant.currency ?? "SGD";

  const cart = { items: cartItems, currency: cartCurrency };

  for (const item of cart.items) {
    const productType = item.product?.product_type;
    if (
      (productType === "pillow" || productType === "bolster") &&
      !item.customization_id
    ) {
      return NextResponse.json(
        {
          error:
            "Mpillow and mbolster are only available through customisation, not the shop cart.",
        },
        { status: 400 },
      );
    }
  }

  const standardItems = cart.items.filter((item) => !item.customization_id);
  const customizedItems = cart.items.filter((item) => !!item.customization_id);

  if (standardItems.length > 0) {
    const variantIds = standardItems.map((item) => item.variant_id);
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

    const requestedByVariant = new Map<string, number>();
    for (const item of standardItems) {
      requestedByVariant.set(
        item.variant_id,
        (requestedByVariant.get(item.variant_id) ?? 0) + item.quantity
      );
    }

    for (const item of standardItems) {
      const available = stockMap.get(item.variant_id) ?? 0;
      if (available < requestedByVariant.get(item.variant_id)!) {
        const title = item.variant?.title ?? item.variant_id;
        return NextResponse.json(
          { error: `Insufficient stock for "${title}". Only ${available} available.` },
          { status: 400 }
        );
      }
    }
  }

  const customizationMap = new Map<string, CustomizationConfigRow>();

  if (customizedItems.length > 0) {
    const customizationIds = customizedItems.map((item) => item.customization_id!);
    const { data: configs, error: configError } = await admin
      .from("customization_configs")
      .select(
        "id, pillow_product_id, ecom_product_id, product_type, bolster_variant, config_lines, filling_lines, total_addon_price, summary"
      )
      .in("id", customizationIds);

    if (configError || !configs) {
      return NextResponse.json({ error: "Failed to load customization configurations" }, { status: 500 });
    }

    for (const cfg of configs) {
      customizationMap.set(cfg.id, cfg);
    }

    const variantByCustomization = new Map<string, string>();
    const reservedComponents = new Map<number, number>();
    for (const item of customizedItems) {
      const cfg = customizationMap.get(item.customization_id!);
      if (!cfg) {
        return NextResponse.json(
          { error: "Customization configuration not found" },
          { status: 400 }
        );
      }

      const productType = resolveCustomizationProductType(cfg);

      const matchesBuild =
        productType === "pillow"
          ? cfg.pillow_product_id != null &&
            item.variant.pillow_product_id != null &&
            Number(item.variant.pillow_product_id) === Number(cfg.pillow_product_id)
          : item.product?.product_type === "bolster" &&
            cfg.ecom_product_id != null &&
            item.variant.product_id === cfg.ecom_product_id;
      if (!matchesBuild) {
        return NextResponse.json(
          { error: "Customization does not match this item" },
          { status: 400 }
        );
      }

      if (
        productType === "bolster" &&
        item.variant.option1?.toLowerCase() !== cfg.bolster_variant
      ) {
        const { data: siblings } = await admin
          .from("product_variants")
          .select("*")
          .eq("product_id", cfg.ecom_product_id)
          .eq("is_active", true);
        const lengthVariant = ((siblings ?? []) as ProductVariant[]).find(
          (v) => v.option1?.toLowerCase() === cfg.bolster_variant
        );
        if (!lengthVariant) {
          return NextResponse.json(
            { error: "This bolster length is no longer available" },
            { status: 400 }
          );
        }
        item.variant = lengthVariant;
        item.variant_id = lengthVariant.id;
      }

      const boundVariant = variantByCustomization.get(item.customization_id!);
      if (boundVariant && boundVariant !== item.variant_id) {
        return NextResponse.json(
          { error: "Customization does not match this item" },
          { status: 400 }
        );
      }
      variantByCustomization.set(item.customization_id!, item.variant_id);

      let key: ComposedSellableKey | null = null;
      if (productType === "bolster") {
        key = cfg.bolster_variant ? { productType: "bolster", length: cfg.bolster_variant } : null;
      } else {
        const { data: pillowProductRow } = await admin
          .from("pillow_products")
          .select("size, kind")
          .eq("id", cfg.pillow_product_id)
          .maybeSingle();
        key = pillowProductRow
          ? {
              productType: "pillow",
              size: String(pillowProductRow.size),
              tier: String(pillowProductRow.kind ?? "basic"),
            }
          : null;
      }
      const quote = key
        ? await quoteCustomization(
            admin,
            key,
            cfg.config_lines as ConfigLine[],
            cfg.filling_lines as FillingLine[]
          )
        : ({ ok: false, error: "Unknown customised product" } as const);
      if (!quote.ok) {
        return NextResponse.json({ error: quote.error }, { status: 400 });
      }
      customizationMap.set(item.customization_id!, {
        ...cfg,
        config_lines: quote.lines,
        filling_lines: quote.fillingLines,
        total_addon_price: Number((quote.subtotal - Number(item.variant.price)).toFixed(2)),
      });

      const result = await validateCustomizationConfig({
        product_type: productType,
        pillow_product_id: cfg.pillow_product_id ?? undefined,
        bolster_variant: cfg.bolster_variant ?? undefined,
        filling_lines: quote.fillingLines,
        component_quantities: quote.lines,
        orderQuantity: item.quantity,
        reserved: reservedComponents,
      });

      if (!result.valid) {
        const shortageNames = result.shortages.map((s) => s.name).join(", ");
        return NextResponse.json(
          { error: `Insufficient component stock for customized item: ${shortageNames}` },
          { status: 400 }
        );
      }
      for (const [itemId, qty] of result.needed) {
        reservedComponents.set(itemId, (reservedComponents.get(itemId) ?? 0) + qty);
      }
    }
  }

  const missingStripePrice = cart.items.some((item) => !stripePriceIdOf(item.variant));
  if (missingStripePrice) {
    return NextResponse.json(
      { error: "Some items are not available for online purchase" },
      { status: 400 }
    );
  }

  const subtotal = cart.items.reduce((sum, item) => {
    const basePrice = item.quantity * (item.variant?.price ?? 0);
    const addonPrice = item.customization_id
      ? (customizationMap.get(item.customization_id)?.total_addon_price ?? 0) * item.quantity
      : 0;
    return sum + basePrice + addonPrice;
  }, 0);

  let discountAmount = 0;
  let couponId: string | null = null;
  let appliedCouponCode: string | null = null;
  let isFreeShipping = false;

  const normalizedEmail = email.toLowerCase().trim();
  const existingCustomer = await findCustomerByEmail(normalizedEmail);

  const codeGiven = Boolean(code?.trim());
  const legacyCouponCode = codeGiven ? "" : (coupon_code?.trim() ?? "");
  const typedCode = await resolveCheckoutCode(code);
  const coupon =
    typedCode?.kind === "coupon"
      ? typedCode.coupon
      : legacyCouponCode
        ? await findActiveCoupon(legacyCouponCode)
        : null;
  if (!coupon && legacyCouponCode) {
    return NextResponse.json({ error: "This code isn't valid" }, { status: 400 });
  }

  if (coupon) {
    const productIds = cart.items.map((item) => item.product?.id).filter(Boolean) as string[];
    const categoryIds = cart.items
      .map((item) => item.product?.category_id)
      .filter(Boolean) as string[];
    const lineItems = cart.items.map((item) => {
      const basePrice = item.quantity * (item.variant?.price ?? 0);
      const addonPrice = item.customization_id
        ? (customizationMap.get(item.customization_id)?.total_addon_price ?? 0) * item.quantity
        : 0;
      return {
        productId: item.product?.id ?? "",
        categoryId: item.product?.category_id ?? null,
        lineTotal: basePrice + addonPrice,
      };
    });

    const couponResult = await checkCoupon(coupon, subtotal, productIds, categoryIds, {
      customerEmail: normalizedEmail,
      account: await couponAccount(coupon),
      lineItems,
    });
    if (!couponResult.valid) {
      return NextResponse.json({ error: couponResult.error ?? "Invalid coupon" }, { status: 400 });
    }
    discountAmount = couponResult.discount_amount ?? 0;
    couponId = couponResult.coupon?.id ?? null;
    appliedCouponCode = coupon.code;
    isFreeShipping = couponResult.coupon?.discount_type === "free_shipping";
  }

  const { data: shippingMethodRow, error: shippingError } = await admin
    .from("shipping_methods")
    .select("*")
    .eq("id", shipping_method_id)
    .eq("is_active", true)
    .single();

  if (shippingError || !shippingMethodRow || isSelfCollect(shippingMethodRow)) {
    return NextResponse.json({ error: "Invalid or unavailable shipping method" }, { status: 400 });
  }

  const shippingMethod = shippingMethodRow as ShippingMethod;
  if (!methodDeliversTo(shippingMethod, shipping_address.country)) {
    return NextResponse.json(
      { error: "This shipping method does not deliver to the selected country" },
      { status: 400 },
    );
  }

  let shippingAmount: number;
  let shippingLabel = resolveShippingContent(shippingMethod).name;
  let courierColumns: Record<string, unknown> = {};
  let shipmentQuote: { courier_service_id: string; quoted_carrier_cost: number | null } | null = null;
  if ((shippingMethod.rate_source ?? "flat") === "easyship") {
    const { options } = await quoteShippingMethods(admin, {
      methods: [shippingMethod],
      lines: cart.items.map((item) =>
        toShippableLine({ ...item.variant, products: item.product ?? null }, item.quantity),
      ),
      destination: {
        country: shipping_address.country,
        postal_code: shipping_address.postal_code,
        city: shipping_address.city,
        state: shipping_address.state ?? null,
        line1: shipping_address.line1,
        line2: shipping_address.line2 ?? null,
      },
      subtotal,
      loadSettings: () => readShippingSettings(),
    });
    const option = options[0];
    if (!option) {
      return NextResponse.json(
        { error: "This shipping method is not available for this address right now. Please choose another method." },
        { status: 400 },
      );
    }
    shippingAmount = isFreeShipping ? 0 : option.amount;
    if (option.courier) {
      shippingLabel = `${shippingLabel} — ${option.courier.name}`;
      courierColumns = { shipping_courier: option.courier.name };
      shipmentQuote = {
        courier_service_id: option.courier.service_id,
        quoted_carrier_cost: option.carrier_cost,
      };
    }
  } else {
    shippingAmount = isFreeShipping ? 0 : calculateShippingRate(shippingMethod, subtotal);
  }

  const codedPartner =
    typedCode?.kind === "referral"
      ? typedCode.partner
      : !codeGiven && !coupon && referral_code
        ? await getPartnerByReferralCode(referral_code)
        : null;
  const sessionPartner = codedPartner ? await getPartnerContext() : null;
  const referralPartner =
    codedPartner &&
    !(await isSelfReferral(codedPartner.id, { sessionPartnerId: sessionPartner?.partnerId, email: normalizedEmail }))
      ? codedPartner
      : null;

  let discountLabel: string | null = appliedCouponCode;
  let selfPurchasePartnerId: string | null = null;
  let selfPurchaseUnits = 0;
  const partnerCtx = codedPartner ? sessionPartner : await getPartnerContext();
  if (!referralPartner) {
    if (isPartnerActive(partnerCtx)) {
      const allowance = await loadSelfPurchaseAllowance(partnerCtx.partnerId);
      const commissionableLines = cart.items
        .filter(
          (item) =>
            item.product?.product_type === "pillow" || item.product?.product_type === "bolster",
        )
        .map((item) => ({
          unitPrice:
            (item.variant?.price ?? 0) +
            (item.customization_id
              ? customizationMap.get(item.customization_id)?.total_addon_price ?? 0
              : 0),
          quantity: item.quantity,
        }));
      const sp = computeSelfPurchaseDiscount(allowance, commissionableLines);
      if (sp.discountAmount > 0) {
        discountAmount = Math.round((discountAmount + sp.discountAmount) * 100) / 100;
        discountLabel = appliedCouponCode ? `${appliedCouponCode} + Partner pricing` : "Partner pricing";
        selfPurchasePartnerId = partnerCtx.partnerId;
        selfPurchaseUnits = sp.discountedUnits;
      }
    }
  }

  let pointsSpent = 0;
  let pointsDiscount = 0;
  let pointsCustomerId: string | null = null;
  if (pointsRequested) {
    const sessionCustomerId = await getCurrentCustomerId();
    if (
      !sessionCustomerId ||
      !mayUseAccountValue(sessionCustomerId, {
        sessionCustomerId,
        emailCustomerId: existingCustomer?.id ?? null,
      })
    ) {
      return NextResponse.json({ error: POINTS_ACCOUNT_ERROR }, { status: 400 });
    }
    if (partnerCtx?.status === "approved") {
      return NextResponse.json({ error: POINTS_PARTNER_ERROR }, { status: 400 });
    }

    let settings: PointsSettings;
    let available: number;
    try {
      settings = await readPointsSettings(admin);
      available = (await readPointsBalance(admin, sessionCustomerId)).available;
    } catch (err) {
      console.error("[checkout] Could not read points:", err instanceof Error ? err.message : err);
      return NextResponse.json({ error: "We couldn't check your points. Please try again." }, { status: 500 });
    }
    if (!settings.enabled) {
      return NextResponse.json({ error: POINTS_DISABLED_ERROR }, { status: 400 });
    }

    const check = validatePointsRequest(parsed.data.points, {
      available,
      productsAfterCoupon: subtotal - discountAmount,
      minRedeem: settings.minRedeem,
      maxShare: settings.maxShare,
    });
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }
    pointsSpent = check.points;
    pointsDiscount = check.discount;
    pointsCustomerId = sessionCustomerId;
    discountAmount = Math.round((discountAmount + pointsDiscount) * 100) / 100;
    discountLabel = withPointsLabel(discountLabel);
  }

  const useStripeTax = process.env.STRIPE_AUTOMATIC_TAX === "true";
  const taxInput = { subtotal, shippingAmount, discountAmount };
  const taxRule = await resolveTaxRuleForRegion(shipping_address.country);
  const tax = computeTax(taxInput, taxRule);
  const taxAmount = tax.taxAmount;
  const total = computeOrderTotal(taxInput, tax);

  const snapshots = cart.items.map((item) => {
    const cfg = item.customization_id ? customizationMap.get(item.customization_id) : null;
    return cfg ? buildCheckoutCustomizationSnapshot(cfg) : null;
  });
  let lineCosts: Array<{ unit_cost: number | null; total_cost: number | null }>;
  try {
    lineCosts = await orderLinesCosts(
      admin,
      cart.items.map((item, i) => ({
        variant: item.variant,
        quantity: item.quantity,
        customization_id: item.customization_id,
        customization_snapshot: snapshots[i] as Record<string, unknown> | null,
      }))
    );
  } catch {
    return NextResponse.json({ error: "Failed to load item costs" }, { status: 500 });
  }

  const customer = await findOrCreateCustomer(email, { phone: phone ?? undefined });

  const { data: orderRow, error: orderError } = await admin
    .from("orders")
    .insert({
      customer_id: customer.id,
      email: email.toLowerCase().trim(),
      phone: phone ?? null,
      status: "pending",
      currency: cart.currency ?? "SGD",
      subtotal,
      shipping_amount: shippingAmount,
      tax_amount: taxAmount,
      discount_amount: discountAmount,
      total,
      shipping_address: shipping_address,
      shipping_method_id,
      ...courierColumns,
      coupon_id: couponId,
      coupon_code: appliedCouponCode,
      partner_id: referralPartner?.id ?? null,
      ref_code: referralPartner?.referral_code ?? null,
      attribution_source: referralPartner ? "typed" : null,
      self_purchase_partner_id: selfPurchasePartnerId,
      self_purchase_units: selfPurchaseUnits,
      ...(pointsSpent > 0 ? { points_spent: pointsSpent, points_discount: pointsDiscount } : {}),
      payment_method: "stripe",
      locale,
    })
    .select("id, order_number")
    .single();

  if (orderError || !orderRow) {
    return NextResponse.json(
      { error: orderError?.message ?? "Failed to create order" },
      { status: 500 }
    );
  }

  await recordCheckoutConsent(admin, customer.id, parsed.data.marketing_email === true);

  if (shipmentQuote) {
    const { error: shipmentError } = await admin
      .from("order_shipments")
      .insert({ order_id: orderRow.id, ...shipmentQuote });
    if (shipmentError) {
      console.error(`[checkout] Could not record the courier quote for ${orderRow.id}:`, shipmentError.message);
    }
  }

  const orderItems = cart.items.map((item, i) => {
    const cfg = item.customization_id
      ? customizationMap.get(item.customization_id)
      : null;
    const addonPrice = cfg?.total_addon_price ?? 0;
    const { unit_cost, total_cost } = lineCosts[i];

    return {
      order_id: orderRow.id,
      variant_id: item.variant_id,
      sku: item.variant?.sku ?? "",
      product_title:
        Object.values(item.product?.content ?? {})[0]?.title ?? item.product?.slug ?? "",
      variant_title: item.variant?.title ?? null,
      image_url: item.variant?.image_url ?? null,
      quantity: item.quantity,
      unit_price: (item.variant?.price ?? 0) + addonPrice,
      total_price: item.quantity * ((item.variant?.price ?? 0) + addonPrice),
      unit_cost,
      total_cost,
      customization_id: item.customization_id ?? null,
      customization_snapshot: snapshots[i],
    };
  });

  const { error: itemsError } = await admin.from("order_items").insert(orderItems);
  if (itemsError) {
    await admin.from("orders").delete().eq("id", orderRow.id);
    return NextResponse.json({ error: "Failed to create order items" }, { status: 500 });
  }

  if (pointsSpent > 0 && pointsCustomerId) {
    const reserved = await reservePoints(admin, {
      customerId: pointsCustomerId,
      orderId: orderRow.id,
      points: pointsSpent,
    });
    if (reserved !== "reserved") {
      await abandonPendingOrder(admin, orderRow.id, { reserved: reserved === "error" });
      return NextResponse.json(
        { error: reserveRefusalMessage(reserved) },
        { status: reserved === "error" ? 500 : 409 },
      );
    }
  }

  const { getSiteOrigin } = await import("@/lib/site-url");
  const siteUrl = getSiteOrigin();

  const paymentUi = resolvePaymentUi(parsed.data.payment_ui);

  let stripeSession: { sessionId: string; url: string | null; clientSecret: string | null };
  try {
    stripeSession = await createCheckoutSession({
      lineItems: cart.items.map((item) => {
        const cfg = item.customization_id ? customizationMap.get(item.customization_id) : null;
        const itemTitle =
          Object.values(item.product?.content ?? {})[0]?.title ?? item.product?.slug ?? "item";
        return {
          variant: item.variant,
          quantity: item.quantity,
          addonAmount: cfg?.total_addon_price ?? 0,
          addonLabel: cfg ? `${itemTitle} — customization` : undefined,
        };
      }),
      customerEmail: email,
      orderId: orderRow.id,
      orderNumber: orderRow.order_number,
      successUrl: `${siteUrl}/${locale}/shop/checkout/confirmation?order_number=${encodeURIComponent(
        orderRow.order_number
      )}&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${siteUrl}/${locale}/shop/checkout`,
      ui: paymentUi,
      shippingAmount,
      shippingLabel,
      discountAmount,
      discountLabel: discountLabel ?? undefined,
      automaticTax: useStripeTax,
      customerName: shipping_address.recipient,
      customerAddress: useStripeTax
        ? {
            line1: shipping_address.line1,
            line2: shipping_address.line2,
            city: shipping_address.city,
            state: shipping_address.state,
            postal_code: shipping_address.postal_code,
            country: shipping_address.country,
          }
        : undefined,
      taxAmount: tax.mode === "exclusive" ? taxAmount : 0,
      taxLabel: tax.rate > 0 ? `${tax.name} (${(tax.rate * 100).toFixed(2).replace(/\.?0+$/, "")}%)` : undefined,
      cartToken: cartToken ?? undefined,
      idempotencyKey: `checkout_${orderRow.id}`,
    });
    if (paymentUi === "elements" ? !stripeSession.clientSecret : !stripeSession.url) {
      throw new Error("Stripe did not return a way to pay this checkout. Please try again.");
    }
  } catch (err) {
    await abandonPendingOrder(admin, orderRow.id, { reserved: pointsSpent > 0 });
    const message = err instanceof Error ? err.message : "Failed to create payment session";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  await admin
    .from("orders")
    .update({ stripe_session_id: stripeSession.sessionId })
    .eq("id", orderRow.id);

  await stitchShopperVisitor(admin, req, { email: normalizedEmail, customerId: customer.id });

  if (paymentUi === "elements") {
    return NextResponse.json({
      ok: true,
      payment_ui: "elements",
      client_secret: stripeSession.clientSecret,
      session_id: stripeSession.sessionId,
      order_number: orderRow.order_number,
    });
  }
  return NextResponse.json({
    ok: true,
    payment_ui: "hosted",
    checkout_url: stripeSession.url,
    order_number: orderRow.order_number,
  });
}

async function abandonPendingOrder(
  admin: ReturnType<typeof supabaseAdmin>,
  orderId: string,
  opts: { reserved: boolean },
) {
  if (opts.reserved) {
    const released = await releasePoints(admin, orderId);
    if (!released.ok) {
      await admin
        .from("orders")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", orderId);
      return;
    }
  }
  await admin.from("order_items").delete().eq("order_id", orderId);
  await admin.from("orders").delete().eq("id", orderId);
}
