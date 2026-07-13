export type PreferenceProductType = "pillow" | "bolster";
export type PreferenceCategory = "cover" | "case";

export function preferenceCategoryAllowed(
  productType: PreferenceProductType,
  category: PreferenceCategory,
): boolean {
  return productType === "pillow" || category === "case";
}

export function soleCaseId(cases: ReadonlyArray<{ item_id: number }>): number | null {
  return cases.length === 1 ? cases[0]!.item_id : null;
}
