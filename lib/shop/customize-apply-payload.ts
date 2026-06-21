import type { BolsterVariant, ConfigLine, FillingLine, UpsellItem } from "@/lib/types/customization";

export const HARDCODED_UPSELLS: UpsellItem[] = [
  {
    item_id: 9999,
    name: "Extra Pillowcase",
    discount_pct: 20,
    original_price: 29.9,
    price: 23.92,
    quantity: 1,
  },
  {
    item_id: 9998,
    name: "Pillow Protector",
    discount_pct: 15,
    original_price: 19.9,
    price: 16.92,
    quantity: 1,
  },
];

export interface CustomizeApplyRecommendation {
  bolster_variant?: BolsterVariant;
  ecom_product?: { id: string; slug: string } | null;
  recommendation: { recommended_size: string };
  pillow_product: { id: number };
  variant: { id: string; product_id: string } | null;
}

export type CustomizeProductType = "pillow" | "bolster";

const SIZE_TO_BOLSTER_VARIANT: Record<string, BolsterVariant> = {
  S: "short",
  M: "medium",
  L: "long",
};

export function resolveBolsterVariant(
  data: CustomizeApplyRecommendation,
): BolsterVariant {
  if (data.bolster_variant) return data.bolster_variant;
  return SIZE_TO_BOLSTER_VARIANT[data.recommendation.recommended_size] ?? "medium";
}

function resolveEcomProductId(data: CustomizeApplyRecommendation): string | undefined {
  return data.variant?.product_id ?? data.ecom_product?.id;
}

function componentVariantName(
  lines: ConfigLine[],
  category: string,
): string | undefined {
  return lines.find((line) => line.category === category)?.name;
}

export function buildCustomizeApplyPayload(params: {
  productType: CustomizeProductType;
  recommendation: CustomizeApplyRecommendation;
  fillingLines: FillingLine[];
  componentLines: ConfigLine[];
  selectedCover: number | null;
  selectedCase: number | null;
  selectedUpsells: Set<number>;
  selectedTemplateId: number | null;
  llmMetadata: Record<string, unknown>;
}) {
  const {
    productType,
    recommendation,
    fillingLines,
    componentLines,
    selectedCover,
    selectedCase,
    selectedUpsells,
    selectedTemplateId,
    llmMetadata,
  } = params;

  const upsellItems = HARDCODED_UPSELLS.filter((u) => selectedUpsells.has(u.item_id));
  const basePayload = {
    variant_id: recommendation.variant!.id,
    component_quantities: componentLines,
    upsells: upsellItems,
    bom_template_id: selectedTemplateId ?? undefined,
    llm_metadata: llmMetadata,
  };

  if (productType === "bolster") {
    return {
      ...basePayload,
      product_type: "bolster" as const,
      bolster_variant: resolveBolsterVariant(recommendation),
      ecom_product_id: resolveEcomProductId(recommendation),
      filling_lines: [] as FillingLine[],
      cover_variant: componentVariantName(componentLines, "cover"),
      case_variant: componentVariantName(componentLines, "case"),
    };
  }

  return {
    ...basePayload,
    product_type: "pillow" as const,
    pillow_product_id: recommendation.pillow_product.id,
    filling_lines: fillingLines,
    cover_variant: selectedCover ? String(selectedCover) : undefined,
    case_variant: selectedCase ? String(selectedCase) : undefined,
  };
}
