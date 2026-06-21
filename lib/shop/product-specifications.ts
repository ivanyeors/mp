import type { Product, ProductVariant } from "@/lib/types/ecommerce";

// ============================================================
// Product specifications
// ============================================================
//
// Specifications are derived from structured product/variant data rather than a
// placeholder. Sources, in priority order:
//   1. `key:value` tags on the product (e.g. "material:Memory Foam",
//      "fill:Microfiber", "care:Machine washable", "dimensions:60 x 40 cm").
//   2. The selected variant's size/dimension option value.
//   3. The variant's structured fields (weight, SKU) and the product type.
//
// Every field is optional; the UI renders only the fields that resolve, so a
// product with sparse data degrades gracefully.

export interface ProductSpecifications {
  dimensions?: string;
  materials?: string;
  fill?: string;
  weight?: string;
  care?: string;
  sku?: string;
  type?: string;
}

/** Spec label, ordered for display. */
export const SPEC_FIELDS: Array<{ key: keyof ProductSpecifications; label: string }> = [
  { key: "dimensions", label: "Dimensions" },
  { key: "materials", label: "Materials" },
  { key: "fill", label: "Fill" },
  { key: "weight", label: "Weight" },
  { key: "care", label: "Care" },
  { key: "type", label: "Type" },
  { key: "sku", label: "SKU" },
];

/** Parse `key:value` tags into a lookup map (keys lowercased). */
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

/** Resolve a variant option value whose product option name matches `regex`. */
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

/** True when at least one specification field has a value. */
export function hasSpecifications(specs: ProductSpecifications): boolean {
  return SPEC_FIELDS.some(({ key }) => Boolean(specs[key]));
}
