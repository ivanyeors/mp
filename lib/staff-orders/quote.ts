/**
 * Price a Staff order from the database (ADR 0048). The draft names Variants,
 * Services, where it goes and a code; every amount here is read from the shop
 * (`product_variants.price`, the MSRP mirror checkout charges), Costings
 * (`service_prices`), the shipping method and the coupon. The dialog's summary
 * and the Order that is written come from this one function, so what Staff
 * see is what the customer is asked to pay.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { checkCoupon, findActiveCoupon } from "@/lib/ecommerce/discounts";
import { calculateShippingRate, resolveShippingContent } from "@/lib/ecommerce/shipping";
import { computeOrderTotal, computeTax, resolveTaxRuleForRegion } from "@/lib/ecommerce/tax";
import type { StockVariant } from "@/lib/ecommerce/inventory-deduction";
import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";
import { getLocation } from "@/lib/locations";
import { SERVICE_LABELS, SERVICE_SKUS, loadServicePrices, type ServicePrices } from "@/lib/pricing/service-prices";
import { toShippableLine } from "@/lib/shipping/lines";
import { quoteShippingMethods } from "@/lib/shipping/quote";
import { collectionAddress, isSelfCollect, methodDeliversTo } from "@/lib/shipping/self-collect";
import { readShippingSettings } from "@/lib/shipping/settings";
import type { Product, ShippingMethod } from "@/lib/types/ecommerce";
import {
  MIN_CHARGE,
  mergeQuantities,
  round2,
  subtotals,
  type StaffOrderDraft,
  type StaffOrderLine,
  type StaffOrderQuoteView,
} from "@/lib/staff-orders/shared";

/** A pillow or bolster is a customised build: a Result, never a Staff order line. */
const CUSTOMISED_ONLY = new Set(["pillow", "bolster"]);

export type StaffOrderCustomer = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  locale: Locale;
};

type VariantRow = StockVariant & {
  id: string;
  product_id: string;
  sku: string | null;
  title: string | null;
  price: number | string;
  currency: string | null;
  cost_price: number | string | null;
  image_url: string | null;
  weight_grams: number | null;
  is_active: boolean;
  products: Pick<Product, "id" | "slug" | "content" | "product_type" | "status" | "category_id"> | null;
};

/** The quote plus what only the server needs to write the Order. */
export type StaffOrderQuote = StaffOrderQuoteView & {
  customer: StaffOrderCustomer;
  /** Each goods line's Variant, for its frozen cost; keyed by Variant id. */
  variants: Map<string, VariantRow>;
  servicePrices: ServicePrices | null;
  shippingAddress: Record<string, unknown>;
  shippingMethodId: string | null;
  courierColumns: Record<string, unknown>;
  shipmentQuote: { courier_service_id: string; quoted_carrier_cost: number | null } | null;
  couponId: string | null;
  note: string | null;
  internalNote: string | null;
};

export type QuoteOutcome =
  | { ok: true; quote: StaffOrderQuote }
  | { ok: false; status: number; error: string };

const refuse = (status: number, error: string): QuoteOutcome => ({ ok: false, status, error });

/** A product's name as the shop shows it: the default locale's title, else any. */
export function productTitle(product: Pick<Product, "content" | "slug"> | null | undefined): string {
  if (!product) return "Product";
  const content = product.content ?? {};
  return content[DEFAULT_LOCALE]?.title || Object.values(content)[0]?.title || product.slug || "Product";
}

export function customerDisplayName(c: Pick<StaffOrderCustomer, "firstName" | "lastName" | "email">): string {
  return [c.firstName, c.lastName].filter(Boolean).join(" ").trim() || c.email;
}

export async function loadStaffOrderCustomer(
  admin: SupabaseClient,
  customerId: string,
): Promise<StaffOrderCustomer | null> {
  const { data, error } = await admin
    .from("customers")
    .select("id, email, first_name, last_name, phone, locale")
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const locale = String(data.locale ?? "");
  return {
    id: data.id as string,
    email: String(data.email),
    firstName: (data.first_name as string | null) ?? null,
    lastName: (data.last_name as string | null) ?? null,
    phone: (data.phone as string | null) ?? null,
    locale: isSupportedLocale(locale) ? locale : DEFAULT_LOCALE,
  };
}

export async function quoteStaffOrder(admin: SupabaseClient, draft: StaffOrderDraft): Promise<QuoteOutcome> {
  const customer = await loadStaffOrderCustomer(admin, draft.customer_id);
  if (!customer) return refuse(404, "Customer not found");

  // ── Goods: the shop's price, the shop's stock ──
  const goods = mergeQuantities(draft.goods, "variant_id");
  const variants = new Map<string, VariantRow>();
  if (goods.length > 0) {
    const { data, error } = await admin
      .from("product_variants")
      .select(
        "id, product_id, sku, title, price, currency, cost_price, image_url, weight_grams, is_active, pillow_product_id, item_id, track_inventory, option1, products!inner(id, slug, content, product_type, status, category_id)",
      )
      .in(
        "id",
        goods.map((g) => g.variant_id),
      );
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as unknown as VariantRow[]) variants.set(row.id, row);
  }

  const lines: StaffOrderLine[] = [];
  for (const g of goods) {
    const v = variants.get(g.variant_id);
    const product = v?.products ?? null;
    if (!v || !product || !v.is_active || product.status === "archived") {
      return refuse(400, "A product in this order is no longer for sale. Remove it and try again.");
    }
    if (CUSTOMISED_ONLY.has(product.product_type)) {
      return refuse(
        400,
        `${productTitle(product)} is a customised build. Start a customisation for it; a Staff order takes products and services only.`,
      );
    }
    if ((v.currency ?? "SGD").toUpperCase() !== "SGD") {
      return refuse(400, `${productTitle(product)} is not priced in SGD.`);
    }
    const unitPrice = Number(v.price);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return refuse(400, `${productTitle(product)} has no price. Set it in Costings first.`);
    }
    lines.push({
      kind: "goods",
      variantId: v.id,
      productId: product.id,
      categoryId: product.category_id ?? null,
      sku: v.sku ?? "",
      title: productTitle(product),
      variantTitle: v.title ?? null,
      imageUrl: v.image_url ?? null,
      unitPrice: round2(unitPrice),
      quantity: g.quantity,
      stockAvailable: 0,
    });
  }

  const shortage = await checkGoodsStock(
    admin,
    lines.filter((l): l is Extract<StaffOrderLine, { kind: "goods" }> => l.kind === "goods"),
  );
  if (shortage) return refuse(400, shortage);

  // ── Services: Costings, never typed (ADR 0024) ──
  const services = mergeQuantities(draft.services, "key");
  let servicePrices: ServicePrices | null = null;
  if (services.length > 0) {
    servicePrices = await loadServicePrices(admin);
    for (const s of services) {
      lines.push({
        kind: "service",
        serviceKey: s.key,
        sku: SERVICE_SKUS[s.key],
        title: SERVICE_LABELS[s.key],
        unitPrice: round2(servicePrices[s.key].msrp),
        quantity: s.quantity,
      });
    }
  }

  const sums = subtotals(lines);
  const goodsLines = lines.filter((l): l is Extract<StaffOrderLine, { kind: "goods" }> => l.kind === "goods");

  // ── Discount code: off the goods only, checked against this Customer's account ──
  let discountAmount = 0;
  let couponId: string | null = null;
  let discountCode: string | null = null;
  let freeShipping = false;
  if (draft.code) {
    const coupon = await findActiveCoupon(draft.code);
    if (!coupon) return refuse(400, "This code isn't a discount code we have.");
    if (goodsLines.length === 0) {
      return refuse(400, "A discount code takes money off products, and this order has none.");
    }
    const checked = await checkCoupon(
      coupon,
      sums.goods,
      [...new Set(goodsLines.map((l) => l.productId))],
      goodsLines.map((l) => l.categoryId).filter((id): id is string => !!id),
      {
        customerEmail: customer.email,
        // Staff act for a known Customer, so a per-customer code is counted on theirs.
        account: { customerId: customer.id, email: customer.email },
        lineItems: goodsLines.map((l) => ({
          productId: l.productId,
          categoryId: l.categoryId,
          lineTotal: round2(l.unitPrice * l.quantity),
        })),
      },
    );
    if (!checked.valid) return refuse(400, checked.error ?? "This code can't be used on this order.");
    discountAmount = round2(Math.min(checked.discount_amount ?? 0, sums.goods));
    couponId = checked.coupon?.id ?? coupon.id;
    discountCode = coupon.code;
    freeShipping = checked.coupon?.discount_type === "free_shipping";
  }

  // ── Where it goes ──
  const recipient = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim() || customer.email;
  let shippingAmount = 0;
  let shippingAddress: Record<string, unknown>;
  let shippingMethodId: string | null = null;
  let courierColumns: Record<string, unknown> = {};
  let shipmentQuote: StaffOrderQuote["shipmentQuote"] = null;
  let delivery: StaffOrderQuoteView["delivery"];
  let taxCountry = "SG";

  if (draft.delivery.kind === "studio") {
    const location = await getLocation(draft.delivery.location_id);
    if (!location || location.type !== "own" || !location.address?.trim()) {
      return refuse(400, "Pick one of our studios with an address.");
    }
    // A Self-collect address (CONTEXT.md): the studio's, the customer as recipient,
    // the collect_location marker. Never born delivered; no courier label.
    shippingAddress = collectionAddress(
      { id: location.id, name: location.name, address: location.address, postal_code: location.postalCode },
      recipient,
    );
    delivery = { kind: "studio", locationId: location.id, locationName: location.name };
  } else {
    if (goodsLines.length === 0) {
      return refuse(400, "Nothing here ships. A service-only order is done at a studio.");
    }
    const address = draft.delivery.address;
    const { data: methodRow, error: methodError } = await admin
      .from("shipping_methods")
      .select("*")
      .eq("id", draft.delivery.shipping_method_id)
      .eq("is_active", true)
      .maybeSingle();
    if (methodError) throw new Error(methodError.message);
    const method = methodRow as ShippingMethod | null;
    if (!method || isSelfCollect(method)) {
      return refuse(400, "Pick a delivery method. To hand it over in person, choose a studio.");
    }
    if (!methodDeliversTo(method, address.country)) {
      return refuse(400, "This delivery method doesn't deliver to that country.");
    }
    let label = resolveShippingContent(method).name;
    if ((method.rate_source ?? "flat") === "easyship") {
      // Priced as checkout prices it (ADR 0020): the goods' parcels, from the database.
      const { options } = await quoteShippingMethods(admin, {
        methods: [method],
        lines: goodsLines.map((l) => {
          const v = variants.get(l.variantId)!;
          return toShippableLine(
            { ...v, price: Number(v.price), products: v.products } as Parameters<typeof toShippableLine>[0],
            l.quantity,
          );
        }),
        destination: {
          country: address.country,
          postal_code: address.postal_code,
          city: address.city,
          state: address.state ?? null,
          line1: address.line1,
          line2: address.line2 ?? null,
        },
        subtotal: sums.goods,
        loadSettings: () => readShippingSettings(),
      });
      const option = options[0];
      if (!option) {
        return refuse(400, "This delivery method has no courier for that address right now. Pick another.");
      }
      shippingAmount = option.amount;
      if (option.courier) {
        label = `${label} — ${option.courier.name}`;
        courierColumns = { shipping_courier: option.courier.name };
        shipmentQuote = {
          courier_service_id: option.courier.service_id,
          quoted_carrier_cost: option.carrier_cost,
        };
      }
    } else {
      // A Service fee is outside the free-shipping threshold (CONTEXT.md): goods only.
      shippingAmount = calculateShippingRate(method, sums.goods);
    }
    if (freeShipping) shippingAmount = 0;
    shippingAmount = round2(Number(shippingAmount));
    shippingAddress = {
      recipient: address.recipient,
      line1: address.line1,
      ...(address.line2 ? { line2: address.line2 } : {}),
      city: address.city,
      ...(address.state ? { state: address.state } : {}),
      postal_code: address.postal_code,
      country: address.country,
      ...(address.phone ? { phone: address.phone } : {}),
    };
    shippingMethodId = method.id;
    taxCountry = address.country;
    delivery = { kind: "ship", methodId: method.id, label };
  }

  // ── Tax and total, as checkout computes them ──
  const taxInput = { subtotal: sums.all, shippingAmount, discountAmount };
  const tax = computeTax(taxInput, await resolveTaxRuleForRegion(taxCountry));
  const total = computeOrderTotal(taxInput, tax);
  // Stored as the webhook reconciles it (subtotal − discount + shipping + tax):
  // inclusive tax is inside the prices already, so it is not added again.
  const taxAmount = tax.mode === "exclusive" ? round2(tax.taxAmount) : 0;

  if (total < MIN_CHARGE) {
    return refuse(400, `Stripe can't take less than SGD ${MIN_CHARGE.toFixed(2)}. Add something or drop the code.`);
  }

  return {
    ok: true,
    quote: {
      currency: "SGD",
      lines,
      goodsSubtotal: sums.goods,
      servicesSubtotal: sums.services,
      subtotal: sums.all,
      shippingAmount,
      discountAmount,
      discountCode,
      taxAmount,
      taxLabel: taxAmount > 0 ? `${tax.name} (${round2(tax.rate * 100)}%)` : null,
      total,
      delivery,
      customer,
      variants,
      servicePrices,
      shippingAddress,
      shippingMethodId,
      courierColumns,
      shipmentQuote,
      couponId,
      note: draft.note?.trim() || null,
      internalNote: draft.internal_note?.trim() || null,
    },
  };
}

/** What the browser may see: the quote without the rows the server writes from. */
export function quoteView(quote: StaffOrderQuote): StaffOrderQuoteView {
  return {
    currency: quote.currency,
    lines: quote.lines,
    goodsSubtotal: quote.goodsSubtotal,
    servicesSubtotal: quote.servicesSubtotal,
    subtotal: quote.subtotal,
    shippingAmount: quote.shippingAmount,
    discountAmount: quote.discountAmount,
    discountCode: quote.discountCode,
    taxAmount: quote.taxAmount,
    taxLabel: quote.taxLabel,
    total: quote.total,
    delivery: quote.delivery,
  };
}

export type StockCheckLine = {
  variantId: string;
  quantity: number;
  title: string;
  variantTitle: string | null;
  stockAvailable?: number;
};

/**
 * Per Variant, as checkout checks it (`variant_stock.stock_available`). Fills
 * each goods line's `stockAvailable`, and returns a sentence when one is
 * short, or null. Lines must already be merged per Variant.
 */
export async function checkGoodsStock(
  admin: SupabaseClient,
  goods: StockCheckLine[],
): Promise<string | null> {
  if (goods.length === 0) return null;
  const { data, error } = await admin
    .from("variant_stock")
    .select("variant_id, stock_available")
    .in(
      "variant_id",
      goods.map((l) => l.variantId),
    );
  if (error) throw new Error(error.message);
  const available = new Map(
    ((data ?? []) as Array<{ variant_id: string; stock_available: number | null }>).map((r) => [
      r.variant_id,
      Number(r.stock_available ?? 0),
    ]),
  );
  for (const line of goods) {
    const have = available.get(line.variantId) ?? 0;
    line.stockAvailable = have;
    if (have < line.quantity) {
      const name = [line.title, line.variantTitle].filter(Boolean).join(" · ");
      return have <= 0
        ? `${name} is out of stock.`
        : `Only ${have} of ${name} in stock.`;
    }
  }
  return null;
}
