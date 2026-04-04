"use client";

import { useMemo, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";

import { useBuilder } from "./BuilderProvider";
import { useCart } from "@/lib/shop/cart-context";
import {
  CustomizationStepSummary,
  HARDCODED_UPSELLS,
  computeFillingLines,
  computeComponentLines,
  computeAddonPrice,
  computeUpsellTotal,
} from "@/components/shop/customization-steps";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { DEFAULT_LOCALE } from "@/lib/i18n/locales";

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
  const currency = recommendation?.variant?.currency ?? "MYR";
  const totalPrice = basePrice + addonPrice + upsellTotal;

  const handleAddToCart = useCallback(async () => {
    if (!recommendation?.variant || !recommendation?.pillow_product) return;

    builder.setIsApplying(true);

    try {
      // Build upsell items for the selected ones
      const upsellItems = HARDCODED_UPSELLS.filter((u) => selectedUpsells.has(u.item_id));

      const applyRes = await fetch("/api/shop/customize?action=apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant_id: recommendation.variant.id,
          pillow_product_id: recommendation.pillow_product.id,
          filling_lines: fillingLines,
          cover_variant: selectedCover ? String(selectedCover) : undefined,
          case_variant: selectedCase ? String(selectedCase) : undefined,
          component_quantities: componentLines,
          upsells: upsellItems,
          bom_template_id: selectedTemplateId,
          llm_metadata: {
            source: builder.productType === "bolster" ? "mbolster-builder" : "pillow-builder",
            ...(builder.pillowPreferences ?? {}),
            ...(builder.bolsterPreferences ?? {}),
            config_id: builder.configId,
          },
        }),
      });

      const applyData = await applyRes.json();

      if (!applyData.ok) {
        toast.error(applyData.error ?? "Failed to save configuration");
        return;
      }

      // Determine product info for cart
      const productSlug = builder.productType === "bolster"
        ? `mbolster-${recommendation.pillow_product.size.toLowerCase()}`
        : `mpillow-${recommendation.pillow_product.kind}`;

      const productTitle = builder.productType === "bolster"
        ? "Mbolster"
        : `Mpillow ${recommendation.pillow_product.kind}`;

      addItem({
        variantId: recommendation.variant.id,
        productId: recommendation.variant.product_id,
        productSlug,
        productTitle,
        variantTitle: `Size ${recommendation.pillow_product.size}`,
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
