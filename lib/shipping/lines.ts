import type { SupabaseClient } from "@supabase/supabase-js";
import type { Product, ProductType, ProductVariant } from "@/lib/types/ecommerce";
import type { PackageType, ShippableLine } from "@/lib/shipping/types";

type VariantWithProduct = Pick<ProductVariant, "id" | "sku" | "title" | "price" | "currency" | "weight_grams"> & {
  products?: Pick<Product, "product_type" | "slug" | "content"> | null;
};

function productName(variant: VariantWithProduct): string {
  const content = variant.products?.content as Record<string, { title?: string }> | undefined;
  const title = content?.["en-US"]?.title ?? content?.en?.title ?? variant.products?.slug ?? "Item";
  return variant.title ? `${title} — ${variant.title}` : title;
}

/**
 * One cart line as a courier sees it. The checkout page's quote and the checkout
 * route both go through here with the variant row read from the database, so the
 * two build identical parcels and share one cached rate. Declared value is the
 * Variant's shelf price — close enough for customs, and the same on both sides.
 */
export function toShippableLine(variant: VariantWithProduct, quantity: number): ShippableLine {
  return {
    product_type: (variant.products?.product_type ?? "pillow") as ProductType,
    quantity,
    weight_grams: variant.weight_grams ?? null,
    unit_value: Number(variant.price ?? 0),
    currency: variant.currency ?? "SGD",
    description: productName(variant),
    sku: variant.sku ?? null,
  };
}

/**
 * A quote without a cart: one unit of each product type, declared at the
 * estimate value. The delivery checker and the customisation flows quote this
 * way, and a Result's hold builds the same lines, so it reads the rate the page
 * showed from the quote cache (ADR 0032).
 */
export function estimateLines(types: PackageType[], declaredValue: number, currency: string): ShippableLine[] {
  return types.map((type) => ({
    product_type: type,
    quantity: 1,
    weight_grams: null,
    unit_value: declaredValue,
    currency,
    description: type === "bolster" ? "Mbolster" : type === "accessory" ? "Accessory" : "Mpillow",
  }));
}

/** Load posted cart items (variant + quantity) as shippable lines. Unknown variants are skipped. */
export async function loadShippableLines(
  admin: SupabaseClient,
  items: Array<{ variant_id: string; quantity: number }>,
): Promise<ShippableLine[]> {
  const ids = [...new Set(items.map((i) => i.variant_id))];
  if (ids.length === 0) return [];
  const { data, error } = await admin
    .from("product_variants")
    .select("id, sku, title, price, currency, weight_grams, products(product_type, slug, content)")
    .in("id", ids);
  if (error) throw new Error(error.message);
  const byId = new Map(
    ((data ?? []) as unknown as VariantWithProduct[]).map((v) => [v.id, v]),
  );
  return items.flatMap((i) => {
    const v = byId.get(i.variant_id);
    return v ? [toShippableLine(v, i.quantity)] : [];
  });
}

type OrderItemRow = {
  kind?: string | null;
  variant_id: string | null;
  quantity: number;
  unit_price: number;
  sku: string | null;
  product_title: string | null;
  variant_title: string | null;
  customization_snapshot?: { product_type?: string | null } | null;
  product_variants?: { weight_grams: number | null; products?: { product_type: string } | null } | null;
};

/**
 * An order's lines for its label. A customised build without a variant ships as its
 * product type. A Service fee line (ADR 0024) is not a parcel and is left out —
 * without that, a variant-less service line would be boxed as a "pillow".
 */
export async function loadOrderShippableLines(
  admin: SupabaseClient,
  orderId: string,
  currency: string,
): Promise<ShippableLine[]> {
  const { data, error } = await admin
    .from("order_items")
    .select(
      "kind, variant_id, quantity, unit_price, sku, product_title, variant_title, customization_snapshot, product_variants(weight_grams, products(product_type))",
    )
    .eq("order_id", orderId)
    .neq("kind", "service");
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as OrderItemRow[]).map((row) => {
    const type =
      row.product_variants?.products?.product_type ??
      row.customization_snapshot?.product_type ??
      "pillow";
    return {
      product_type: type as ProductType,
      quantity: row.quantity,
      weight_grams: row.product_variants?.weight_grams ?? null,
      unit_value: Number(row.unit_price ?? 0),
      currency,
      description: [row.product_title, row.variant_title].filter(Boolean).join(" — ") || "Item",
      sku: row.sku,
    };
  });
}
