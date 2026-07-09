/** Group bom_templates rows into Shopify sales-queue template dropdown keys. */

export type ShopifyTemplateOption = {
  id: number;
  name: string;
  pillow_variant: "linen" | "fibrecool" | null;
};

export type BomTemplateRow = {
  id: number | string;
  name: string;
  kind: string;
  key: string;
  pillow_kind?: string | null;
  pillow_variant?: string | null;
};

export function groupShopifyTemplatesByKey(
  rows: BomTemplateRow[],
): Record<string, ShopifyTemplateOption[]> {
  const out: Record<string, ShopifyTemplateOption[]> = {};
  for (const t of rows) {
    const kind = String(t.kind);
    const key = String(t.key);
    let cacheKey: string | null = null;
    if (kind === "pillow") {
      const pk = t.pillow_kind === "premium" ? "premium" : "basic";
      cacheKey = `pillow:${pk}:${key}`;
    } else if (kind === "bolster") {
      cacheKey = `bolster:${key}`;
    }
    if (!cacheKey) continue;

    const option: ShopifyTemplateOption = {
      id: Number(t.id),
      name: String(t.name),
      pillow_variant:
        t.pillow_variant === "linen" || t.pillow_variant === "fibrecool"
          ? t.pillow_variant
          : null,
    };
    const bucket = out[cacheKey] ?? [];
    bucket.push(option);
    out[cacheKey] = bucket;
  }
  return out;
}
