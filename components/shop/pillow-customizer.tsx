"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Loader2,
  Moon,
  Sparkles,
  User,
  Check,
} from "lucide-react";
import { toast } from "sonner";

import { cn, getApiErrorMessage } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { CustomerPreferences } from "@/lib/types/customization";

import {
  type RecommendationResponseData,
  HARDCODED_UPSELLS,
  computeFillingLines,
  computeComponentLines,
  computeAddonPrice,
  computeUpsellTotal,
  CustomizationStepRecommendation,
  CustomizationStepComponents,
  CustomizationStepSummary,
} from "@/components/shop/customization-steps";

// ─── Props ────────────────────────────────────────────────

interface PillowCustomizerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddToCart: (data: {
    variantId: string;
    customizationId: string;
    customizationSummary: string;
    addonPrice: number;
    basePrice: number;
    currency: string;
  }) => void;
}

// ─── API Response Type ───────────────────────────────────

interface ApplyResponse {
  ok: boolean;
  customization_id: string;
  summary: string;
  total_addon_price: number;
}

// ─── Helpers ──────────────────────────────────────────────

const SLEEP_POSITIONS: {
  value: CustomerPreferences["sleep_position"];
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    value: "side",
    label: "Side",
    icon: <Moon className="size-6" />,
    description: "I sleep on my side most nights",
  },
  {
    value: "back",
    label: "Back",
    icon: <User className="size-6" />,
    description: "I sleep flat on my back",
  },
  {
    value: "stomach",
    label: "Stomach",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
        <path d="M3 14c0-2 1-4 4-5l3-1 4 1c3 1 4 3 4 5v4H3v-4z" />
      </svg>
    ),
    description: "I sleep face-down",
  },
  {
    value: "mixed",
    label: "Mixed",
    icon: (
      <svg
        viewBox="0 0 24 24"
        className="size-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3v18M3 12h18" />
        <path d="M8 8l8 8M16 8l-8 8" />
      </svg>
    ),
    description: "I change positions often",
  },
];

const BODY_TYPES: {
  value: CustomerPreferences["body_type"];
  label: string;
}[] = [
  { value: "petite", label: "Petite" },
  { value: "average", label: "Average" },
  { value: "large", label: "Large" },
];

const FIRMNESS_LEVELS: {
  value: CustomerPreferences["firmness"];
  label: string;
}[] = [
  { value: "soft", label: "Soft" },
  { value: "medium-soft", label: "Med-Soft" },
  { value: "medium", label: "Medium" },
  { value: "medium-firm", label: "Med-Firm" },
  { value: "firm", label: "Firm" },
];

const STEPS = [
  "Preferences",
  "Recommendation",
  "Components",
  "Summary",
] as const;

// ─── Component ────────────────────────────────────────────

export function PillowCustomizer({
  open,
  onOpenChange,
  onAddToCart,
}: PillowCustomizerProps) {
  // --- Step state ---
  const [currentStep, setCurrentStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // --- Step 1: Preferences ---
  const [sleepPosition, setSleepPosition] =
    useState<CustomerPreferences["sleep_position"]>("side");
  const [bodyType, setBodyType] =
    useState<CustomerPreferences["body_type"]>("average");
  const [firmness, setFirmness] =
    useState<CustomerPreferences["firmness"]>("medium");
  const [notes, setNotes] = useState("");

  // --- Step 2: Recommendation data ---
  const [recommendation, setRecommendation] =
    useState<RecommendationResponseData | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(
    null
  );

  // --- Step 3: Component selection ---
  const [selectedCover, setSelectedCover] = useState<number | null>(null);
  const [selectedCase, setSelectedCase] = useState<number | null>(null);
  const [componentQtyOverrides, setComponentQtyOverrides] = useState<
    Map<number, number>
  >(new Map());

  // --- Step 4: Upsells ---
  const [selectedUpsells, setSelectedUpsells] = useState<Set<number>>(
    new Set()
  );

  // --- Derived values ---
  const currency = recommendation?.variant?.currency ?? "SGD";
  const basePrice = recommendation?.variant?.price ?? 0;

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
    [componentLines, recommendation]
  );

  const upsellTotal = useMemo(
    () => computeUpsellTotal(selectedUpsells),
    [selectedUpsells]
  );

  const totalPrice = basePrice + addonPrice + upsellTotal;

  // --- Actions ---

  const handleGetRecommendation = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/shop/customize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          preferences: {
            sleep_position: sleepPosition,
            body_type: bodyType,
            firmness,
            notes: notes || undefined,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          getApiErrorMessage(err.error, `Failed to get recommendation (${res.status})`)
        );
      }

      const data: RecommendationResponseData = await res.json();
      setRecommendation(data);
      setSelectedTemplateId(null);

      // Pre-select default cover and case
      const defaultCover = data.components.covers.find(
        (c) => c.base_quantity > 0
      );
      const defaultCase = data.components.cases.find(
        (c) => c.base_quantity > 0
      );
      if (defaultCover) setSelectedCover(defaultCover.item_id);
      if (defaultCase) setSelectedCase(defaultCase.item_id);
      setComponentQtyOverrides(new Map());

      setCurrentStep(1);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to get recommendation"
      );
    } finally {
      setIsLoading(false);
    }
  }, [sleepPosition, bodyType, firmness, notes]);

  const handleApplyAndAddToCart = useCallback(async () => {
    if (!recommendation || !recommendation.variant) {
      toast.error("No variant selected");
      return;
    }

    setIsLoading(true);
    try {
      const coverComp = componentLines.find((c) => c.category === "cover");
      const caseComp = componentLines.find((c) => c.category === "case");

      const activeUpsells = HARDCODED_UPSELLS.filter((u) =>
        selectedUpsells.has(u.item_id)
      );

      const res = await fetch("/api/shop/customize?action=apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          variant_id: recommendation.variant.id,
          pillow_product_id: recommendation.pillow_product.id,
          filling_lines: fillingLines,
          cover_variant: coverComp?.name ?? undefined,
          case_variant: caseComp?.name ?? undefined,
          component_quantities: componentLines,
          upsells: activeUpsells,
          bom_template_id: selectedTemplateId ?? undefined,
          llm_metadata: {
            sleep_position: sleepPosition,
            body_type: bodyType,
            firmness,
            notes: notes || undefined,
          },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(getApiErrorMessage(err.error, "Failed to apply customization"));
      }

      const data: ApplyResponse = await res.json();

      onAddToCart({
        variantId: recommendation.variant.id,
        customizationId: data.customization_id,
        customizationSummary: data.summary,
        addonPrice: data.total_addon_price,
        basePrice,
        currency,
      });

      toast.success("Added to cart!");

      // Reset state
      setCurrentStep(0);
      setRecommendation(null);
      setSelectedTemplateId(null);
      setSelectedCover(null);
      setSelectedCase(null);
      setComponentQtyOverrides(new Map());
      setSelectedUpsells(new Set());
      onOpenChange(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add to cart"
      );
    } finally {
      setIsLoading(false);
    }
  }, [
    recommendation,
    fillingLines,
    componentLines,
    selectedTemplateId,
    selectedUpsells,
    sleepPosition,
    bodyType,
    firmness,
    notes,
    basePrice,
    currency,
    onAddToCart,
    onOpenChange,
  ]);

  const goBack = useCallback(() => {
    setCurrentStep((s) => Math.max(0, s - 1));
  }, []);

  const goNext = useCallback(() => {
    setCurrentStep((s) => Math.min(STEPS.length - 1, s + 1));
  }, []);

  // ─── Render ───────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        mobilePreset="full"
        hideClose={false}
        className="w-full sm:max-w-lg overflow-y-auto"
      >
        <SheetHeader className="pr-10">
          <SheetTitle>Customize Your Pillow</SheetTitle>
        </SheetHeader>

        {/* Step indicator */}
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">
              Step {currentStep + 1} of {STEPS.length}
            </span>
            <span className="text-sm font-medium">{STEPS[currentStep]}</span>
          </div>
          <div className="flex gap-1.5">
            {STEPS.map((_, idx) => (
              <div
                key={idx}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition-colors",
                  idx <= currentStep
                    ? "bg-primary"
                    : "bg-muted"
                )}
              />
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="flex-1 px-4 pb-4 space-y-6">
          {currentStep === 0 && (
            <StepPreferences
              sleepPosition={sleepPosition}
              onSleepPositionChange={setSleepPosition}
              bodyType={bodyType}
              onBodyTypeChange={setBodyType}
              firmness={firmness}
              onFirmnessChange={setFirmness}
              notes={notes}
              onNotesChange={setNotes}
              isLoading={isLoading}
              onSubmit={handleGetRecommendation}
            />
          )}

          {currentStep === 1 && recommendation && (
            <CustomizationStepRecommendation
              data={recommendation}
              selectedTemplateId={selectedTemplateId}
              onSelectTemplate={setSelectedTemplateId}
              fillingLines={fillingLines}
              currency={currency}
              basePrice={basePrice}
              onContinue={goNext}
            />
          )}

          {currentStep === 2 && recommendation && (
            <CustomizationStepComponents
              components={recommendation.components}
              selectedCover={selectedCover}
              onSelectCover={setSelectedCover}
              selectedCase={selectedCase}
              onSelectCase={setSelectedCase}
              componentQtyOverrides={componentQtyOverrides}
              onQtyChange={(itemId, qty) => {
                setComponentQtyOverrides((prev) => {
                  const next = new Map(prev);
                  next.set(itemId, qty);
                  return next;
                });
              }}
              currency={currency}
              basePrice={basePrice}
              addonPrice={addonPrice}
              onBack={goBack}
              onContinue={goNext}
            />
          )}

          {currentStep === 3 && recommendation && (
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
              onToggleUpsell={(itemId) => {
                setSelectedUpsells((prev) => {
                  const next = new Set(prev);
                  if (next.has(itemId)) next.delete(itemId);
                  else next.add(itemId);
                  return next;
                });
              }}
              isLoading={isLoading}
              onBack={goBack}
              onAddToCart={handleApplyAndAddToCart}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Step 1: Preferences ──────────────────────────────────

function StepPreferences({
  sleepPosition,
  onSleepPositionChange,
  bodyType,
  onBodyTypeChange,
  firmness,
  onFirmnessChange,
  notes,
  onNotesChange,
  isLoading,
  onSubmit,
}: {
  sleepPosition: CustomerPreferences["sleep_position"];
  onSleepPositionChange: (v: CustomerPreferences["sleep_position"]) => void;
  bodyType: CustomerPreferences["body_type"];
  onBodyTypeChange: (v: CustomerPreferences["body_type"]) => void;
  firmness: CustomerPreferences["firmness"];
  onFirmnessChange: (v: CustomerPreferences["firmness"]) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  isLoading: boolean;
  onSubmit: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Sleep position */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">
          How do you sleep?
        </Label>
        <div className="grid grid-cols-2 gap-3">
          {SLEEP_POSITIONS.map((pos) => (
            <button
              key={pos.value}
              type="button"
              onClick={() => onSleepPositionChange(pos.value)}
              className={cn(
                "relative flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all",
                "hover:border-primary/50 hover:bg-accent/50",
                sleepPosition === pos.value
                  ? "border-primary bg-primary/5 shadow-sm"
                  : "border-border"
              )}
            >
              {sleepPosition === pos.value && (
                <div className="absolute top-2 right-2">
                  <Check className="size-4 text-primary" />
                </div>
              )}
              <div
                className={cn(
                  "flex items-center justify-center rounded-full p-2.5",
                  sleepPosition === pos.value
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {pos.icon}
              </div>
              <span className="font-medium text-sm">{pos.label}</span>
              <span className="text-xs text-muted-foreground leading-tight">
                {pos.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Body type */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Body type</Label>
        <div className="flex gap-3">
          {BODY_TYPES.map((bt) => (
            <button
              key={bt.value}
              type="button"
              onClick={() => onBodyTypeChange(bt.value)}
              className={cn(
                "flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-medium transition-all",
                "hover:border-primary/50",
                bodyType === bt.value
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-muted-foreground"
              )}
            >
              {bt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Firmness */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Firmness preference</Label>
        <div className="flex rounded-lg border overflow-hidden">
          {FIRMNESS_LEVELS.map((fl) => (
            <button
              key={fl.value}
              type="button"
              onClick={() => onFirmnessChange(fl.value)}
              className={cn(
                "flex-1 py-2.5 text-xs sm:text-sm font-medium transition-all border-r last:border-r-0",
                firmness === fl.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:bg-accent"
              )}
            >
              {fl.label}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground px-1">
          <span>Softer</span>
          <span>Firmer</span>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-2">
        <Label className="text-base font-semibold">
          Additional notes{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Textarea
          placeholder="Any specific preferences, pain points, or requirements..."
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={3}
        />
      </div>

      {/* Submit */}
      <Button
        className="w-full"
        size="lg"
        onClick={onSubmit}
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Analyzing...
          </>
        ) : (
          <>
            <Sparkles className="size-4" />
            Get My Recommendation
          </>
        )}
      </Button>
    </div>
  );
}
