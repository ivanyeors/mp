import { getProducts, getProductPriceRange } from "@/lib/ecommerce/products";

/** Price range across active composed products of a type (pillow / bolster) for configurator JSON-LD. */
export async function getConfiguratorOfferRange(
  productType: "pillow" | "bolster",
): Promise<{ lowPrice: number; highPrice: number; currency: string } | null> {
  const { products } = await getProducts({
    product_type: productType,
    status: "active",
    limit: 20,
  });
  const prices: number[] = [];
  let currency = "SGD";
  for (const p of products) {
    const range = getProductPriceRange(p.variants ?? []);
    if (range.min > 0 || range.max > 0) {
      prices.push(range.min, range.max);
      currency = range.currency || currency;
    }
  }
  if (!prices.length) return null;
  return { lowPrice: Math.min(...prices), highPrice: Math.max(...prices), currency };
}
