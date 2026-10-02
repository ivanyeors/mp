import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";
import { findCustomerByEmail, findOrCreateCustomer } from "@/lib/ecommerce/customers";
import { validateCoupon } from "@/lib/ecommerce/discounts";
import { getPartnerByReferralCode } from "@/lib/referrals";
import { getPartnerContext, isPartnerActive } from "@/lib/auth/partner";
import { computeSelfPurchaseDiscount } from "@/lib/partner-self-purchase";
import { loadSelfPurchaseAllowance } from "@/lib/partner-self-purchase/allowance";
import { calculateShippingRate, resolveShippingContent } from "@/lib/ecommerce/shipping";
import { toShippableLine } from "@/lib/shipping/lines";
import { quoteShippingMethods } from "@/lib/shipping/quote";
import { readShippingSettings } from "@/lib/shipping/settings";
import { computeTax, computeOrderTotal, resolveTaxRuleForRegion } from "@/lib/ecommerce/tax";
import { createCheckoutSession } from "@/lib/stripe/checkout";
import { stripePriceIdOf } from "@/lib/stripe/mode";
import {
  buildCheckoutCustomizationSnapshot,
  resolveCustomizationProductType,
} from "@/lib/ecommerce/customization-product-type";
import { resolveOrderItemUnitCost } from "@/lib/ecommerce/order-cost";
import { validateCustomizationConfig } from "@/lib/shop/customization-inventory";
import { quoteCustomization } from "@/lib/shop/customization-quote";
import type { ComposedSellableKey } from "@/lib/results/composed-sellable";
import { DEFAULT_LOCALE, isSupportedLocale, LOCALE_COOKIE_NAME } from "@/lib/i18n/locales";
import type { BolsterVariant, ConfigLine, CustomizationProductType, FillingLine } from "@/lib/types/customization";
import type { Product, ProductVariant, ShippingMethod } from "@/lib/types/ecommerce";

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
  postal_code: z.string().min(1),
  country: z.string().default("SG"),
  phone: z.string().optional(),
});

const CheckoutItemSchema = z.object({
  variant_id: z.string().uuid(),
  quantity: z.number().int().min(1),
  customization_id: z.string().uuid().optional(),
});

const CheckoutSchema = z.object({
  email: z.string().email(),
  phone: z.string().optional(),
  shipping_address: ShippingAddressSchema,
  shipping_method_id: z.string().uuid(),
  coupon_code: z.string().optional(),
  /** Optional typed partner/referral code (attribution, #74). Never blocks. */
  referral_code: z.string().optional(),
  items: z.array(CheckoutItemSchema).min(1),
});

// Working line item: derived entirely from server-side data (never trust
// client-sent prices). Mirrors the previous cart-item shape so the downstream
// pricing / order-creation logic can stay unchanged.
type WorkingItem = {
  variant_id: string;
  quantity: number;
  customization_id: string | null;
  variant: ProductVariant;
  product: Product | undefined;
};

export async function POST(req: Request) {
  // 1. Validate request body (checkout is authoritative from posted items)
  const body = await req.json().catch(() => null);
  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { email, phone, shipping_address, shipping_method_id, coupon_code, referral_code, items } =
    parsed.data;

  const admin = supabaseAdmin();

  // 2. Optional server cart token (cookie). The storefront uses a localStorage
  // cart, so this is usually absent — we only forward it to Stripe metadata so
  // the webhook can clear a server cart if one happens to exist.
  const cookieStore = await cookies();
  const cartToken = cookieStore.get(CART_COOKIE)?.value ?? null;

  // Resolve the shopper's locale so the post-payment redirect lands on a real,
  // localized confirmation route (avoids an extra middleware redirect).
  const localeCookie = cookieStore.get(LOCALE_COOKIE_NAME)?.value ?? "";
  const locale = isSupportedLocale(localeCookie) ? localeCookie : DEFAULT_LOCALE;

  // 3. Build the authoritative working set from posted items: fetch variants
  // (with product) server-side by variant_id. Prices/currency/stripe_price come
  // from the DB, never from the client.
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

  // Currency is derived from the variants themselves (base currency).
  const cartCurrency = cartItems[0]?.variant.currency ?? "SGD";

  // Shim so the rest of the handler can keep referencing `cart.items`.
  const cart = { items: cartItems, currency: cartCurrency };

  // Composed main products are not plain-buyable; entry is customisation only.
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

  // 5. Validate stock — branch on customization vs standard items
  const standardItems = cart.items.filter((item) => !item.customization_id);
  const customizedItems = cart.items.filter((item) => !!item.customization_id);

  // 5a. Standard items: validate via variant_stock view
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

    // Per Variant, not per line: the same variant_id on two lines, each within
    // stock, would otherwise oversell.
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

  // 5b. Customized items: validate via full config check
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

      // The config prices and builds ONE composed sellable, so the line's Variant
      // must be that sellable's. Otherwise a cheap accessory variant_id carries a
      // full build through checkout. One Variant per customisation, too, since the
      // recomputed price below is stored per customisation.
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

      // A bolster product carries one Variant per length (`option1`, as the
      // variant_stock view and inventory deduction read it). The config's length is
      // what gets priced and built, so the line takes that Variant whatever length
      // was posted — its title and SKU are what fulfilment reads.
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

      // Price the build now, from Costings, through the same quote the customise
      // route used. `total_addon_price` on the row is a display snapshot and is
      // never charged: a Costings change since customising is legitimate, and a
      // tampered row must not name its own price.
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
      // Every downstream reader (subtotal, coupon, order_items, the Stripe line)
      // adds this to `variant.price`, so it is re-based on the Variant: the line then
      // charges exactly the composed subtotal, and Stripe's catalog-Price shortcut
      // (delta 0) fires only when the composed build really costs the shelf price.
      // The lines are the quote's too, so the order snapshot Staff build from and
      // inventory deduct from is the build that was priced.
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
      // Per item across every customised line, as standard lines are per Variant.
      for (const [itemId, qty] of result.needed) {
        reservedComponents.set(itemId, (reservedComponents.get(itemId) ?? 0) + qty);
      }
    }
  }

  // 5c. Load item costs and base BOM quantities for customized items (cost snapshot)
  const costByItem = new Map<number, number>();
  const baseQuantitiesByCustomization = new Map<string, Map<number, number>>();

  if (customizedItems.length > 0) {
    const itemIds = new Set<number>();
    for (const cfg of customizationMap.values()) {
      for (const cl of cfg.config_lines as ConfigLine[]) itemIds.add(cl.item_id);
      for (const fl of cfg.filling_lines as FillingLine[]) itemIds.add(fl.item_id);
    }

    if (itemIds.size > 0) {
      const { data: priceRows, error: priceError } = await admin
        .from("item_prices")
        .select("item_id, cost_price")
        .in("item_id", [...itemIds]);

      if (priceError) {
        return NextResponse.json({ error: "Failed to load item costs" }, { status: 500 });
      }

      for (const row of priceRows ?? []) {
        if (row.cost_price != null) {
          costByItem.set(row.item_id, parseFloat(String(row.cost_price)));
        }
      }
    }

    const pillowProductIds = new Set<number>();
    const bolsterVariants = new Set<BolsterVariant>();
    for (const [id, cfg] of customizationMap) {
      const productType = resolveCustomizationProductType(cfg);
      if (productType === "pillow" && cfg.pillow_product_id) {
        pillowProductIds.add(cfg.pillow_product_id);
      } else if (productType === "bolster" && cfg.bolster_variant) {
        bolsterVariants.add(cfg.bolster_variant);
      }
      baseQuantitiesByCustomization.set(id, new Map());
    }

    if (pillowProductIds.size > 0) {
      const { data: bomLines, error: bomError } = await admin
        .from("bom_lines")
        .select("product_id, item_id, quantity")
        .in("product_id", [...pillowProductIds]);

      if (bomError) {
        return NextResponse.json({ error: "Failed to load base BOM quantities" }, { status: 500 });
      }

      const baseByPillow = new Map<number, Map<number, number>>();
      for (const bl of bomLines ?? []) {
        if (!baseByPillow.has(bl.product_id)) baseByPillow.set(bl.product_id, new Map());
        baseByPillow.get(bl.product_id)!.set(bl.item_id, bl.quantity);
      }

      for (const [id, cfg] of customizationMap) {
        if (resolveCustomizationProductType(cfg) === "pillow" && cfg.pillow_product_id) {
          baseQuantitiesByCustomization.set(
            id,
            new Map(baseByPillow.get(cfg.pillow_product_id) ?? [])
          );
        }
      }
    }

    if (bolsterVariants.size > 0) {
      const { data: bomLines, error: bomError } = await admin
        .from("bolster_bom_lines")
        .select("variant, item_id, quantity")
        .in("variant", [...bolsterVariants]);

      if (bomError) {
        return NextResponse.json({ error: "Failed to load base BOM quantities" }, { status: 500 });
      }

      const baseByBolster = new Map<BolsterVariant, Map<number, number>>();
      for (const bl of bomLines ?? []) {
        const variant = bl.variant as BolsterVariant;
        if (!baseByBolster.has(variant)) baseByBolster.set(variant, new Map());
        baseByBolster.get(variant)!.set(bl.item_id, bl.quantity);
      }

      for (const [id, cfg] of customizationMap) {
        if (resolveCustomizationProductType(cfg) === "bolster" && cfg.bolster_variant) {
          baseQuantitiesByCustomization.set(
            id,
            new Map(baseByBolster.get(cfg.bolster_variant) ?? [])
          );
        }
      }
    }
  }

  // 6. Validate every variant has a Price in the account THIS environment uses
  const missingStripePrice = cart.items.some((item) => !stripePriceIdOf(item.variant));
  if (missingStripePrice) {
    return NextResponse.json(
      { error: "Some items are not available for online purchase" },
      { status: 400 }
    );
  }

  // 7. Calculate subtotal (including customization addon prices)
  const subtotal = cart.items.reduce((sum, item) => {
    const basePrice = item.quantity * (item.variant?.price ?? 0);
    const addonPrice = item.customization_id
      ? (customizationMap.get(item.customization_id)?.total_addon_price ?? 0) * item.quantity
      : 0;
    return sum + basePrice + addonPrice;
  }, 0);

  // 8. Validate coupon if provided
  let discountAmount = 0;
  let couponId: string | null = null;
  let appliedCouponCode: string | null = null;
  let isFreeShipping = false;

  const normalizedEmail = email.toLowerCase().trim();
  const existingCustomer = await findCustomerByEmail(normalizedEmail);

  if (coupon_code) {
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

    const couponResult = await validateCoupon(coupon_code, subtotal, productIds, categoryIds, {
      customerEmail: normalizedEmail,
      customerId: existingCustomer?.id,
      lineItems,
    });
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
  if (
    Array.isArray(shippingMethod.countries) &&
    shippingMethod.countries.length > 0 &&
    !shippingMethod.countries.includes(shipping_address.country.toUpperCase())
  ) {
    return NextResponse.json(
      { error: "This shipping method does not deliver to the selected country" },
      { status: 400 },
    );
  }

  let shippingAmount: number;
  let shippingLabel = resolveShippingContent(shippingMethod).name;
  // Set only for a live (Easyship) method; flat methods leave the courier columns untouched.
  let courierColumns: Record<string, unknown> = {};
  let shipmentQuote: { courier_service_id: string; quoted_carrier_cost: number | null } | null = null;
  if ((shippingMethod.rate_source ?? "flat") === "easyship") {
    // Re-priced here from the database, never taken from the client. The page's
    // quote built the same parcels from the same variants, so this reads the
    // rate the shopper was shown from the quote cache (ADR 0020).
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
        { error: "No courier on this shipping method delivers to this address. Please choose another method." },
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

  // Referral attribution (#74): resolved BEFORE tax so a self-purchase discount
  // (#82) reduces the taxable base. Invalid code silently attributes nothing.
  const referralPartner = referral_code
    ? await getPartnerByReferralCode(referral_code)
    : null;

  // Partner self-purchase (#82): a signed-in APPROVED partner buying pillows/
  // bolsters in their OWN account, and NOT via a referral attribution. It is
  // UNATTRIBUTED by design — orders.partner_id stays null (set only from
  // referralPartner below), so commission (#77 fires on order.partner_id) and
  // milestone (#79, counts attributed commissions) NEVER fire. The discount is
  // folded into discountAmount + applied as a Stripe coupon (mirroring the coupon
  // path) so the partner is actually charged the better price. Over-cap units keep
  // MSRP. self_purchase_partner_id (NOT partner_id) tracks the allowance for AC5.
  let discountLabel: string | null = appliedCouponCode;
  let selfPurchasePartnerId: string | null = null;
  let selfPurchaseUnits = 0;
  if (!referralPartner) {
    const partnerCtx = await getPartnerContext();
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

  // 10. Compute tax from the configurable region/rate table (keyed on the
  // shipping country) and the grand total. When Stripe Tax is enabled this is
  // only a pre-checkout ESTIMATE: the webhook overwrites tax_amount/total from
  // the completed session (Stripe Tax is authoritative). When disabled it is
  // the final tax, added to Stripe as an explicit exclusive line item.
  const useStripeTax = process.env.STRIPE_AUTOMATIC_TAX === "true";
  const taxInput = { subtotal, shippingAmount, discountAmount };
  const taxRule = await resolveTaxRuleForRegion(shipping_address.country);
  const tax = computeTax(taxInput, taxRule);
  const taxAmount = tax.taxAmount;
  const total = computeOrderTotal(taxInput, tax);

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
      // Shop has only the typed-code attribution path today (no assist/link),
      // so a referral here is always 'typed'; self-purchase (#82) stays null (#80).
      attribution_source: referralPartner ? "typed" : null,
      // #82: self-purchase marker + consumed-unit count. NOT partner_id, so this
      // never triggers commission/milestone — it only tracks the allowance.
      self_purchase_partner_id: selfPurchasePartnerId,
      self_purchase_units: selfPurchaseUnits,
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

  // The courier the shopper chose and what it cost us, for the label later.
  // Server-only table; a failure here must not lose the sale.
  if (shipmentQuote) {
    const { error: shipmentError } = await admin
      .from("order_shipments")
      .insert({ order_id: orderRow.id, ...shipmentQuote });
    if (shipmentError) {
      console.error(`[checkout] Could not record the courier quote for ${orderRow.id}:`, shipmentError.message);
    }
  }

  // 13. Create order_items from cart items
  const orderItems = cart.items.map((item) => {
    const cfg = item.customization_id
      ? customizationMap.get(item.customization_id)
      : null;
    const addonPrice = cfg?.total_addon_price ?? 0;
    const variantCost =
      item.variant?.cost_price != null
        ? parseFloat(String(item.variant.cost_price))
        : null;
    const { unit_cost, total_cost } = resolveOrderItemUnitCost({
      variantCostPrice: variantCost,
      quantity: item.quantity,
      customization: cfg
        ? {
            config_lines: cfg.config_lines as ConfigLine[],
            baseQuantities: baseQuantitiesByCustomization.get(item.customization_id!) ?? new Map(),
            costByItem,
          }
        : undefined,
    });

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
      customization_snapshot: cfg ? buildCheckoutCustomizationSnapshot(cfg) : null,
    };
  });

  const { error: itemsError } = await admin.from("order_items").insert(orderItems);
  if (itemsError) {
    // Attempt to clean up the orphaned order
    await admin.from("orders").delete().eq("id", orderRow.id);
    return NextResponse.json({ error: "Failed to create order items" }, { status: 500 });
  }

  // 14. Create Stripe Checkout Session
  const { getSiteOrigin } = await import("@/lib/site-url");
  const siteUrl = getSiteOrigin();

  let stripeSession: { sessionId: string; url: string | null };
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
      shippingAmount,
      shippingLabel,
      // The discount is applied as a Stripe coupon so the customer is charged
      // the discounted amount (closes the discount leak).
      discountAmount,
      discountLabel: discountLabel ?? undefined,
      // Stripe Tax (gated): compute tax on the post-discount amount and supply
      // the address. Otherwise add manual exclusive tax as a line item.
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
      // Only exclusive tax is added to the Stripe total; inclusive tax is
      // already embedded in the variant prices.
      taxAmount: tax.mode === "exclusive" ? taxAmount : 0,
      taxLabel: tax.rate > 0 ? `${tax.name} (${(tax.rate * 100).toFixed(2).replace(/\.?0+$/, "")}%)` : undefined,
      cartToken: cartToken ?? undefined,
      // Stable per-order key: a double-submit reuses the same Stripe session
      // instead of creating a duplicate.
      idempotencyKey: `checkout_${orderRow.id}`,
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

  // Note: coupon usage is incremented in the Stripe webhook after successful payment,
  // not here — avoids double-counting when checkout sessions are abandoned.

  // 15. Return checkout URL and order number
  return NextResponse.json({
    ok: true,
    checkout_url: stripeSession.url,
    order_number: orderRow.order_number,
  });
}
