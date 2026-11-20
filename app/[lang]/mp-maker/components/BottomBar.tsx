"use client";

import { useMemo } from "react";
import { ArrowRight, ShoppingCart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBuilder } from "./BuilderProvider";
import {
  formatPrice,
  computeComponentLines,
  computeAddonPrice,
  computeUpsellTotal,
} from "@/components/shop/customization-steps";

interface BottomBarProps {
  onAddToCart?: () => void;
}

export function BottomBar({ onAddToCart }: BottomBarProps) {
  const builder = useBuilder();
  const {
    step,
    recommendation,
    selectedCover,
    selectedCase,
    componentQtyOverrides,
    selectedUpsells,
    isApplying,
  } = builder;

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
  const showPrice = recommendation && step !== "preferences";

  const isFirstStep = step === "preferences";
  const isLastStep = step === "summary";

  if (isFirstStep) return null;

  return (
    <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 px-5 py-4 space-y-3 max-md:pb-[calc(1rem+var(--app-dock-clearance))]">
      {showPrice && (
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Base</span>
            <span>{formatPrice(basePrice, currency)}</span>
          </div>
          {addonPrice > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Add-ons</span>
              <span className="text-primary">+{formatPrice(addonPrice, currency)}</span>
            </div>
          )}
          {upsellTotal > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Extras</span>
              <span className="text-primary">+{formatPrice(upsellTotal, currency)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold border-t pt-2 mt-1">
            <span>Total</span>
            <span className="text-primary">{formatPrice(totalPrice, currency)}</span>
          </div>
        </div>
      )}

      {isLastStep ? (
        <Button
          onClick={onAddToCart}
          disabled={isApplying}
          className="w-full"
          size="lg"
        >
          {isApplying ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <ShoppingCart className="size-4" />
              Add to Cart
            </>
          )}
        </Button>
      ) : (
        <Button onClick={builder.goNext} className="w-full" size="lg">
          Continue
          <ArrowRight className="size-4" />
        </Button>
      )}
    </div>
  );
}
