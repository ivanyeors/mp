/** Filling Templates: filling-only Configure BOM templates, size-scoped. */

export type FillingProductType = "pillow" | "bolster";

export type FillingTemplateLike = {
  kind: string;
  key: string;
  role: string;
  is_active: boolean;
};

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
