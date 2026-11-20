import type { ProductVariant } from "@/lib/types/ecommerce";

export function shopCardPrice(
  variants: Pick<ProductVariant, "price" | "compare_at_price" | "currency" | "is_active">[],
): { price: number; compareAt: number | null; from: boolean; currency: string } | null {
  const active = variants.filter((v) => v.is_active).map((v) => ({ ...v, price: Number(v.price) }));
  if (!active.length) return null;
  const cheapest = [...active].sort((a, b) => a.price - b.price)[0];
  const compareAt = cheapest.compare_at_price == null ? null : Number(cheapest.compare_at_price);
  return {
    price: cheapest.price,
    compareAt: compareAt !== null && compareAt > cheapest.price ? compareAt : null,
    from: active.length > 1,
    currency: cheapest.currency,
  };
}
