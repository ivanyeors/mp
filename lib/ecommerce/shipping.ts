import { supabaseAdmin } from "@/lib/supabase/server";
import type { ShippingMethod } from "@/lib/types/ecommerce";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locales";

export async function getActiveShippingMethods(country = "SG"): Promise<ShippingMethod[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("shipping_methods")
    .select("*")
    .eq("is_active", true)
    .contains("countries", [country])
    .order("position", { ascending: true });

  if (error) return [];
  return (data ?? []) as ShippingMethod[];
}

export async function getAllShippingMethods(): Promise<ShippingMethod[]> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("shipping_methods")
    .select("*")
    .order("position", { ascending: true });

  if (error) return [];
  return (data ?? []) as ShippingMethod[];
}

export function calculateShippingRate(method: ShippingMethod, subtotal: number): number {
  if (method.free_above !== null && subtotal >= method.free_above) {
    return 0;
  }
  return method.base_rate;
}

export function resolveShippingContent(method: ShippingMethod, locale: Locale = DEFAULT_LOCALE) {
  const content = method.content[locale] ?? method.content[DEFAULT_LOCALE] ?? Object.values(method.content)[0];
  return content ?? { name: method.slug, description: "", estimated_days: "" };
}
