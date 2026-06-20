"use client";

import { useMemo } from "react";
import { useBuilder } from "./BuilderProvider";
import {
  CustomizationStepComponents,
  computeComponentLines,
  computeAddonPrice,
} from "@/components/shop/customization-steps";

export function StepComponents() {
  const builder = useBuilder();
  const { recommendation, selectedCover, selectedCase, componentQtyOverrides } = builder;

  const componentLines = useMemo(
    () => computeComponentLines(recommendation, selectedCover, selectedCase, componentQtyOverrides),
    [recommendation, selectedCover, selectedCase, componentQtyOverrides]
  );

  const addonPrice = useMemo(
    () => computeAddonPrice(recommendation, componentLines),
    [recommendation, componentLines]
  );

  if (!recommendation) return null;

  const basePrice = recommendation.variant?.price ?? 0;
  const currency = recommendation.variant?.currency ?? "SGD";

  return (
    <CustomizationStepComponents
      components={recommendation.components}
      selectedCover={selectedCover}
      onSelectCover={builder.setSelectedCover}
      selectedCase={selectedCase}
      onSelectCase={builder.setSelectedCase}
      componentQtyOverrides={componentQtyOverrides}
      onQtyChange={builder.setComponentQtyOverride}
      currency={currency}
      basePrice={basePrice}
      addonPrice={addonPrice}
      onBack={builder.goBack}
      onContinue={builder.goNext}
    />
  );
}
