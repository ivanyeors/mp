"use client";

import { useMemo, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import { useBuilder } from "./BuilderProvider";
import { useCart } from "@/lib/shop/cart-context";
import {
  CustomizationStepSummary,
  computeFillingLines,
  computeComponentLines,
  computeAddonPrice,
  computeUpsellTotal,
  type RecommendationResponseData,
} from "@/components/shop/customization-steps";
import { HARDCODED_UPSELLS } from "@/lib/shop/customize-apply-payload";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getApiErrorMessage } from "@/lib/utils";
import type { ConfigLine, FillingLine } from "@/lib/types/customization";
import type { ProductType } from "./BuilderProvider";
import {
  buildCustomizeApplyPayload,
  resolveBolsterVariant,
} from "@/lib/shop/customize-apply-payload";

export { buildCustomizeApplyPayload, resolveBolsterVariant };

export function canApplyRecommendation(
  productType: ProductType,
  recommendation: RecommendationResponseData | null
): recommendation is RecommendationResponseData {
  if (!recommendation?.variant) return false;
  if (productType === "bolster") return true;
  return Boolean(recommendation.pillow_product);
}

export function getCartProductInfo(
  productType: ProductType,
  recommendation: RecommendationResponseData
) {
  const sizeLabel = recommendation.recommendation.recommended_size;

  if (productType === "bolster") {
    const slugSuffix = sizeLabel.toLowerCase();
    return {
      productSlug: `mbolster-${slugSuffix}`,
      productTitle: "Mbolster",
      variantTitle: `Size ${sizeLabel}`,
    };
  }

  return {
    productSlug: `mpillow-${recommendation.pillow_product.kind}`,
    productTitle: `Mpillow ${recommendation.pillow_product.kind}`,
    variantTitle: `Size ${recommendation.pillow_product.size}`,
  };
}

export function StepSummary() {
  const builder = useBuilder();
  const { addItem } = useCart();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const locale = getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;

  const { recommendation, selectedTemplateId, selectedCover, selectedCase, componentQtyOverrides, selectedUpsells } = builder;

  const fillingLines = useMemo(
    () => computeFillingLines(recommendation, selectedTemplateId),
    [recommendation, selectedTemplateId]
  );

  const componentLines = useMemo(
    () => computeComponentLines(recommendation, selectedCover, selectedCase, componentQtyOverrides),
    [recommendation, selectedCover, selectedCase, componentQtyOverrides]
  );

  const addonPrice = useMemo(
    () => computeAddonPrice(recommendation, componentLines),
    [recommendation, componentLines]
  );

  const upsellTotal = useMemo(
    () => computeUpsellTotal(selectedUpsells),
    [selectedUpsells]
  );

  const basePrice = recommendation?.variant?.price ?? 0;
  const currency = recommendation?.variant?.currency ?? "SGD";
  const totalPrice = basePrice + addonPrice + upsellTotal;

  const handleAddToCart = useCallback(async () => {
    if (!canApplyRecommendation(builder.productType, recommendation)) return;

    builder.setIsApplying(true);

    try {
      const applyRes = await fetch("/api/shop/customize?action=apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildCustomizeApplyPayload({
            productType: builder.productType,
            recommendation,
            fillingLines,
            componentLines,
            selectedCover,
            selectedCase,
            selectedUpsells,
            selectedTemplateId,
            llmMetadata: {
              source: builder.productType === "bolster" ? "mbolster-builder" : "pillow-builder",
              ...(builder.pillowPreferences ?? {}),
              ...(builder.bolsterPreferences ?? {}),
              config_id: builder.configId,
            },
          })
        ),
      });

      const applyData = await applyRes.json().catch(() => ({}));

      if (!applyRes.ok || !applyData.ok) {
        toast.error(getApiErrorMessage(applyData.error, "Failed to save configuration"));
        return;
      }

      const { productSlug, productTitle, variantTitle } = getCartProductInfo(
        builder.productType,
        recommendation
      );

      addItem({
        variantId: recommendation.variant!.id,
        productId: recommendation.variant!.product_id,
        productSlug,
        productTitle,
        variantTitle,
        imageUrl: null,
        price: basePrice,
        compareAtPrice: null,
        currency,
        quantity: 1,
        customizationId: applyData.customization_id,
        customizationSummary: applyData.summary,
        addonPrice: applyData.total_addon_price,
      });

      toast.success("Added to cart!");
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      builder.setIsApplying(false);
    }
  }, [
    recommendation,
    fillingLines,
    componentLines,
    selectedCover,
    selectedCase,
    selectedTemplateId,
    selectedUpsells,
    basePrice,
    currency,
    builder,
    addItem,
    router,
    locale,
  ]);

  if (!recommendation) return null;

  const productLabel = builder.productType === "bolster" ? "Mbolster" : undefined;

  return (
    <CustomizationStepSummary
      data={recommendation}
      fillingLines={fillingLines}
      componentLines={componentLines}
      selectedCover={selectedCover}
      selectedCase={selectedCase}
      basePrice={basePrice}
      addonPrice={addonPrice}
      upsellTotal={upsellTotal}
      totalPrice={totalPrice}
      currency={currency}
      selectedUpsells={selectedUpsells}
      onToggleUpsell={builder.toggleUpsell}
      isLoading={builder.isApplying}
      onBack={builder.goBack}
      onAddToCart={handleAddToCart}
      productLabel={productLabel}
    />
  );
}
