import type { Product } from "@/lib/types/ecommerce";

/**
 * Where a pillow or bolster is ordered: its configurator, the one commercial
 * page for it (`.claude/PRD-seo-aeo-geo`). Null for a product sold as it is.
 * Client-safe, unlike `@/lib/ecommerce/products`.
 */
export function configuratorPath(productType: Product["product_type"]): "/mp-config" | "/mbolster-config" | null {
  if (productType === "pillow") return "/mp-config";
  if (productType === "bolster") return "/mbolster-config";
  return null;
}
