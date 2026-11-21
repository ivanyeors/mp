import { formatTemplateKeys, templateServesKey, type FillingKind } from "./keys";

export * from "./keys";

export type FillingProductType = "pillow" | "bolster";

export type FillingTemplateLike = {
  kind: string;
  key: string;
  keys?: string[];
  role: string;
  is_active: boolean;
};

export type ProductCardKey =
  | { productType: "pillow"; size: string; tier: string }
  | { productType: "bolster"; length: string };

export type LineWithCategory = {
  item_id: number;
  category: string;
};

export function validateFillingOnlyLines(
  lines: LineWithCategory[],
): { ok: true } | { ok: false; error: string } {
  const bad = lines.filter((l) => l.category !== "filling");
  if (bad.length === 0) return { ok: true };
  const ids = bad.map((l) => l.item_id).join(", ");
  return { ok: false, error: `Filling Templates may only include filling items (rejected item_id: ${ids})` };
}

export function validateDefaultFillingTemplate(
  template: FillingTemplateLike,
  productCard: ProductCardKey,
): { ok: true } | { ok: false; error: string } {
  if (template.role !== "filling") {
    return { ok: false, error: "Default must reference a Filling Template (role=filling)" };
  }
  if (!template.is_active) {
    return { ok: false, error: "Default Filling Template must be active" };
  }
  const expectedKind = productCard.productType;
  const expectedKey =
    productCard.productType === "pillow" ? productCard.size : productCard.length;
  if (template.kind !== expectedKind) {
    return {
      ok: false,
      error: `Template kind "${template.kind}" does not match product type "${expectedKind}"`,
    };
  }
  if (!templateServesKey(template, expectedKey)) {
    const served = formatTemplateKeys(expectedKind as FillingKind, template.keys ?? [template.key]);
    return {
      ok: false,
      error: `Template applies to ${served}, not the product card scope "${expectedKey}"`,
    };
  }
  return { ok: true };
}

export function filterSelectableFillingTemplates<T extends FillingTemplateLike>(
  templates: T[],
  opts: { productType: FillingProductType; size: string },
): T[] {
  return templates.filter(
    (t) =>
      t.role === "filling" &&
      t.is_active &&
      t.kind === opts.productType &&
      templateServesKey(t, opts.size),
  );
}
