import type { Product } from "@/lib/types/ecommerce";

export function configuratorPath(productType: Product["product_type"]): "/mp-config" | "/mbolster-config" | null {
  if (productType === "pillow") return "/mp-config";
  if (productType === "bolster") return "/mbolster-config";
  return null;
}
