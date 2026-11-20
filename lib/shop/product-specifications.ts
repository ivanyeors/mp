import type { Product, ProductVariant } from "@/lib/types/ecommerce";

export interface ProductSpecifications {
  dimensions?: string;
  materials?: string;
  fill?: string;
  weight?: string;
  care?: string;
  sku?: string;
  type?: string;
}

export const SPEC_FIELDS: Array<{ key: keyof ProductSpecifications; label: string }> = [
  { key: "dimensions", label: "Dimensions" },
  { key: "materials", label: "Materials" },
  { key: "fill", label: "Fill" },
  { key: "weight", label: "Weight" },
  { key: "care", label: "Care" },
  { key: "type", label: "Type" },
  { key: "sku", label: "SKU" },
];

function parseTagAttributes(tags: string[] | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const tag of tags ?? []) {
    const idx = tag.indexOf(":");
    if (idx <= 0) continue;
    const key = tag.slice(0, idx).trim().toLowerCase();
    const value = tag.slice(idx + 1).trim();
    if (key && value) map.set(key, value);
  }
  return map;
}

function firstTag(attrs: Map<string, string>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = attrs.get(key);
    if (value) return value;
  }
  return undefined;
}

function findOptionValue(
  product: Product,
  variant: ProductVariant | null,
  regex: RegExp
): string | undefined {
  if (!variant) return undefined;
  const option = product.options?.find((o) => regex.test(o.name));
  if (!option) return undefined;
  for (const value of [variant.option1, variant.option2, variant.option3]) {
    if (value && option.values.includes(value)) return value;
  }
  return undefined;
}

function formatWeight(grams: number): string {
  if (grams >= 1000) return `${(grams / 1000).toFixed(grams % 1000 === 0 ? 0 : 2)} kg`;
  return `${grams} g`;
}

export function buildProductSpecifications(
  product: Product,
  variant: ProductVariant | null
): ProductSpecifications {
  const attrs = parseTagAttributes(product.tags);

  const specs: ProductSpecifications = {
    dimensions:
      firstTag(attrs, "dimensions", "size") ??
      findOptionValue(product, variant, /size|dimension/i),
    materials: firstTag(attrs, "material", "materials", "fabric", "cover"),
    fill: firstTag(attrs, "fill", "filling"),
    weight:
      firstTag(attrs, "weight") ??
      (variant?.weight_grams != null ? formatWeight(variant.weight_grams) : undefined),
    care: firstTag(attrs, "care"),
    sku: variant?.sku ?? undefined,
    type: product.product_type
      ? product.product_type.charAt(0).toUpperCase() + product.product_type.slice(1)
      : undefined,
  };

  return specs;
}

export function hasSpecifications(specs: ProductSpecifications): boolean {
  return SPEC_FIELDS.some(({ key }) => Boolean(specs[key]));
}
