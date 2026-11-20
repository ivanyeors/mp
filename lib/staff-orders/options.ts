import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveShippingContent } from "@/lib/ecommerce/shipping";
import { getLocations } from "@/lib/locations";
import { SERVICE_KEYS, SERVICE_LABELS, loadServicePrices, type ServiceKey } from "@/lib/pricing/service-prices";
import { isSelfCollect } from "@/lib/shipping/self-collect";
import { productTitle } from "@/lib/staff-orders/quote";
import type { CustomerAddress, Product, ShippingMethod } from "@/lib/types/ecommerce";

export type StaffOrderProductOption = {
  variantId: string;
  title: string;
  variantTitle: string | null;
  sku: string | null;
  price: number;
  stockAvailable: number;
  imageUrl: string | null;
  unlisted: boolean;
};

export type StaffOrderServiceOption = { key: ServiceKey; label: string; price: number };

export type StaffOrderMethodOption = {
  id: string;
  name: string;
  live: boolean;
  baseRate: number;
  freeAbove: number | null;
  countries: string[];
};

export type StaffOrderStudioOption = { id: string; name: string; address: string };

export type StaffOrderAddressOption = Pick<
  CustomerAddress,
  "id" | "label" | "recipient" | "line1" | "line2" | "city" | "state" | "postal_code" | "country" | "phone" | "is_default"
>;

export type StaffOrderOptions = {
  products: StaffOrderProductOption[];
  services: StaffOrderServiceOption[];
  servicesError: string | null;
  methods: StaffOrderMethodOption[];
  studios: StaffOrderStudioOption[];
  addresses: StaffOrderAddressOption[];
};

type VariantRow = {
  id: string;
  sku: string | null;
  title: string | null;
  price: number | string;
  currency: string | null;
  image_url: string | null;
  products: Pick<Product, "slug" | "content" | "product_type" | "status"> | null;
};

export async function loadStaffOrderOptions(admin: SupabaseClient, customerId: string): Promise<StaffOrderOptions> {
  const [variantsRes, methodsRes, addressesRes, studios, services] = await Promise.all([
    admin
      .from("product_variants")
      .select("id, sku, title, price, currency, image_url, products!inner(slug, content, product_type, status)")
      .eq("is_active", true)
      .neq("products.status", "archived")
      .not("products.product_type", "in", "(pillow,bolster)"),
    admin.from("shipping_methods").select("*").eq("is_active", true).order("position"),
    admin
      .from("customer_addresses")
      .select("id, label, recipient, line1, line2, city, state, postal_code, country, phone, is_default")
      .eq("customer_id", customerId)
      .order("is_default", { ascending: false }),
    getLocations({ type: "own" }).catch(() => []),
    loadServicePrices(admin).then(
      (prices) => ({ prices, error: null as string | null }),
      (err: unknown) => ({ prices: null, error: err instanceof Error ? err.message : "Service prices unavailable" }),
    ),
  ]);
  if (variantsRes.error) throw new Error(variantsRes.error.message);

  const variants = ((variantsRes.data ?? []) as unknown as VariantRow[]).filter(
    (v) => v.products && (v.currency ?? "SGD").toUpperCase() === "SGD",
  );
  const stock = new Map<string, number>();
  if (variants.length > 0) {
    const { data, error } = await admin
      .from("variant_stock")
      .select("variant_id, stock_available")
      .in(
        "variant_id",
        variants.map((v) => v.id),
      );
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as Array<{ variant_id: string; stock_available: number | null }>) {
      stock.set(r.variant_id, Number(r.stock_available ?? 0));
    }
  }

  const products = variants
    .map(
      (v): StaffOrderProductOption => ({
        variantId: v.id,
        title: productTitle(v.products),
        variantTitle: v.title ?? null,
        sku: v.sku ?? null,
        price: Number(v.price),
        stockAvailable: stock.get(v.id) ?? 0,
        imageUrl: v.image_url ?? null,
        unlisted: v.products?.status !== "active",
      }),
    )
    .sort((a, b) => a.title.localeCompare(b.title) || (a.variantTitle ?? "").localeCompare(b.variantTitle ?? ""));

  const methods = ((methodsRes.data ?? []) as ShippingMethod[])
    .filter((m) => !isSelfCollect(m))
    .map(
      (m): StaffOrderMethodOption => ({
        id: m.id,
        name: resolveShippingContent(m).name,
        live: (m.rate_source ?? "flat") === "easyship",
        baseRate: Number(m.base_rate),
        freeAbove: m.free_above == null ? null : Number(m.free_above),
        countries: m.countries ?? [],
      }),
    );

  return {
    products,
    services: services.prices
      ? SERVICE_KEYS.map((key) => ({ key, label: SERVICE_LABELS[key], price: services.prices![key].msrp }))
      : [],
    servicesError: services.error,
    methods,
    studios: studios
      .filter((s) => s.address?.trim())
      .map((s) => ({ id: s.id, name: s.name, address: [s.address, s.postalCode].filter(Boolean).join(" ") })),
    addresses: (addressesRes.data ?? []) as StaffOrderAddressOption[],
  };
}
