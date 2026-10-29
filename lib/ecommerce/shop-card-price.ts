import type { ProductVariant } from "@/lib/types/ecommerce";

/**
 * Pure — the price a shop card shows for a product, and the price an email's
 * products block shows for it (PRD-campaign-email-editor slice 07): one rule,
 * so the two never disagree. Its cheapest active Variant's price, and that
 * Variant's compare-at price when it is above it, which the card strikes
 * through. `from` is whether it has more than one active Variant, which the
 * card says as *From*. Every price is a Costings mirror (ADR 0001). Null when
 * no Variant is active.
 *
 * No server import: components/shop/product-card.tsx is a client component.
 */
export function shopCardPrice(
  variants: Pick<ProductVariant, "price" | "compare_at_price" | "currency" | "is_active">[],
): { price: number; compareAt: number | null; from: boolean; currency: string } | null {
  const active = variants.filter((v) => v.is_active).map((v) => ({ ...v, price: Number(v.price) }));
  if (!active.length) return null;
  // Stable, so a tie keeps the Variants' own order.
  const cheapest = [...active].sort((a, b) => a.price - b.price)[0];
  const compareAt = cheapest.compare_at_price == null ? null : Number(cheapest.compare_at_price);
  return {
    price: cheapest.price,
    compareAt: compareAt !== null && compareAt > cheapest.price ? compareAt : null,
    from: active.length > 1,
    currency: cheapest.currency,
  };
}
