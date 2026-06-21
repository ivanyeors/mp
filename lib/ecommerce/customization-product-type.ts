import type { BolsterVariant, CustomizationProductType } from "@/lib/types/customization";

export type CustomizationConfigForCheckout = {
  product_type: CustomizationProductType | null;
  bolster_variant: BolsterVariant | null;
};

export function resolveCustomizationProductType(
  cfg: CustomizationConfigForCheckout
): CustomizationProductType {
  if (cfg.product_type === "bolster" || cfg.product_type === "pillow") {
    return cfg.product_type;
  }
  if (cfg.bolster_variant) return "bolster";
  return "pillow";
}

export type CheckoutCustomizationSnapshot = {
  product_type: CustomizationProductType;
  bolster_variant: BolsterVariant | null;
  config_lines: unknown[];
  filling_lines: unknown[];
  total_addon_price: number;
  summary: string | null;
};

export function buildCheckoutCustomizationSnapshot(cfg: {
  product_type: CustomizationProductType | null;
  bolster_variant: BolsterVariant | null;
  config_lines: unknown[];
  filling_lines: unknown[];
  total_addon_price: number;
  summary: string | null;
}): CheckoutCustomizationSnapshot {
  return {
    product_type: resolveCustomizationProductType(cfg),
    bolster_variant: cfg.bolster_variant,
    config_lines: cfg.config_lines,
    filling_lines: cfg.filling_lines,
    total_addon_price: cfg.total_addon_price,
    summary: cfg.summary,
  };
}
