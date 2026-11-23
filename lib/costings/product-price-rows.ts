export type BolsterVariant = "short" | "medium" | "long";
export type PremiumVariant = "linen" | "fibrecool";

export const BOLSTER_VARIANT_TITLES: Record<BolsterVariant, string> = {
  short: "Short (0.8m)",
  medium: "Medium (1m)",
  long: "Long (1.2m)",
};

export const PREMIUM_VARIANT_TITLES: Record<PremiumVariant, string> = {
  linen: "Linen",
  fibrecool: "Fibrecool",
};

export type StoredProductPrice = {
  key: string;
  kind: string;
  product_id: number | null;
  variant: string | null;
  msrp: string | number | null;
  compare_at_price?: string | number | null;
};

export type ProductPriceRowRef =
  | { kind: "pillow"; key: string; productId: number; premiumVariant: PremiumVariant | null }
  | { kind: "bolster"; variant: BolsterVariant };

const lastMatch = <T>(rows: readonly T[], match: (row: T) => boolean): T | undefined => {
  let found: T | undefined;
  for (const row of rows) if (match(row)) found = row;
  return found;
};

export function storedProductPrice<T extends StoredProductPrice>(
  rows: readonly T[],
  ref: ProductPriceRowRef,
): T | undefined {
  if (ref.kind === "bolster") return lastMatch(rows, (row) => row.kind === "bolster" && row.variant === ref.variant);
  const byKey = rows.find((row) => row.key === ref.key);
  if (byKey || ref.premiumVariant) return byKey;
  return lastMatch(rows, (row) => row.kind === "pillow" && row.product_id === ref.productId);
}

export function productPriceLabel(
  row: { kind: "pillow"; size: string; premiumVariant: PremiumVariant | null } | { kind: "bolster"; variant: BolsterVariant },
): string {
  if (row.kind === "bolster") return `Mbolster ${BOLSTER_VARIANT_TITLES[row.variant]}`;
  return row.premiumVariant
    ? `Premium Mpillow ${row.size}, ${PREMIUM_VARIANT_TITLES[row.premiumVariant]}`
    : `Basic Mpillow ${row.size}`;
}
