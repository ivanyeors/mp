"use client";

import { useMemo } from "react";
import { useBuilder } from "./BuilderProvider";
import {
  CustomizationStepRecommendation,
  computeFillingLines,
} from "@/components/shop/customization-steps";
import { Badge } from "@/components/ui/badge";

export function StepRecommendation() {
  const builder = useBuilder();
  const { recommendation, selectedTemplateId, configId } = builder;

  const fillingLines = useMemo(
    () => computeFillingLines(recommendation, selectedTemplateId),
    [recommendation, selectedTemplateId]
  );

  if (!recommendation) return null;

  const basePrice = recommendation.variant?.price ?? 0;
  const currency = recommendation.variant?.currency ?? "SGD";
  const productLabel = builder.productType === "bolster" ? "Mbolster" : undefined;

  return (
    <div className="space-y-4">
      {configId && (
        <Badge variant="secondary" className="text-xs">
          Based on your measurements
        </Badge>
      )}
      <CustomizationStepRecommendation
        data={recommendation}
        selectedTemplateId={selectedTemplateId}
        onSelectTemplate={builder.setSelectedTemplateId}
        fillingLines={fillingLines}
        currency={currency}
        basePrice={basePrice}
        onContinue={builder.goNext}
        productLabel={productLabel}
      />
    </div>
  );
}
