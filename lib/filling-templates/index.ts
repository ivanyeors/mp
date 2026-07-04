/** Filling Templates: filling-only Configure BOM templates, size-scoped. */

export type FillingProductType = "pillow" | "bolster";

export type FillingTemplateLike = {
  kind: string;
  key: string;
  role: string;
  is_active: boolean;
};

/** Product card scope for default filling validation (pillow size×tier or bolster length). */
export type ProductCardKey =
  | { productType: "pillow"; size: string; tier: string }
  | { productType: "bolster"; length: string };

export type LineWithCategory = {
  item_id: number;
  category: string;
};

/** Reject any non-filling line. Pure — no I/O. */
export function validateFillingOnlyLines(
  lines: LineWithCategory[],
): { ok: true } | { ok: false; error: string } {
  const bad = lines.filter((l) => l.category !== "filling");
  if (bad.length === 0) return { ok: true };
  const ids = bad.map((l) => l.item_id).join(", ");
  return { ok: false, error: `Filling Templates may only include filling items (rejected item_id: ${ids})` };
}

/** Validate a template may be set as the default for a product card. Pure — no I/O. */
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
  if (template.key !== expectedKey) {
    return {
      ok: false,
      error: `Template key "${template.key}" does not match product card scope "${expectedKey}"`,
    };
  }
  return { ok: true };
}

/** Active Filling Templates for a product type + size key. Pure — no I/O. */
export function filterSelectableFillingTemplates<T extends FillingTemplateLike>(
  templates: T[],
  opts: { productType: FillingProductType; size: string },
): T[] {
  return templates.filter(
    (t) =>
      t.role === "filling" &&
      t.is_active &&
      t.kind === opts.productType &&
      t.key === opts.size,
  );
}
