"use server";

import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Validates cart item prices against the database before checkout.
 * Returns corrected prices if any differ from the client-sent prices.
 */
export async function validateCartPrices(
  items: { variantId: string; clientPrice: number }[],
) {
  if (items.length === 0) return { valid: true, corrections: [] };

  const admin = supabaseAdmin();
  const variantIds = items.map((i) => i.variantId);

  const { data: variants, error } = await admin
    .from("product_variants")
    .select("id, price, is_active")
    .in("id", variantIds);

  if (error) throw new Error("Failed to validate prices");

  const priceMap = new Map(
    (variants ?? []).map((v: { id: string; price: number; is_active: boolean }) => [v.id, v])
  );

  const corrections: { variantId: string; serverPrice: number; clientPrice: number }[] = [];

  for (const item of items) {
    const variant = priceMap.get(item.variantId);
    if (!variant) {
      corrections.push({ variantId: item.variantId, serverPrice: 0, clientPrice: item.clientPrice });
      continue;
    }
    if (Math.abs(variant.price - item.clientPrice) > 0.01) {
      corrections.push({ variantId: item.variantId, serverPrice: variant.price, clientPrice: item.clientPrice });
    }
  }

  return {
    valid: corrections.length === 0,
    corrections,
  };
}
