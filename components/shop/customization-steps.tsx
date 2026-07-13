"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  ShoppingCart,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/i18n/currencies";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { QuantitySelector } from "@/components/shop/quantity-selector";

import type {
  BolsterVariant,
  CustomizationProductType,
  FillingLine,
  ConfigLine,
  ComponentOption,
  UpsellItem,
} from "@/lib/types/customization";

// ─── Shared Types ────────────────────────────────────────────

export interface RecommendationResponseData {
  ok: boolean;
  product_type?: CustomizationProductType;
  bolster_variant?: BolsterVariant;
  ecom_product?: { id: string; slug: string } | null;
  recommendation: {
    recommended_size: string;
    recommended_kind: string;
    filling_lines: FillingLine[];
    summary: string;
    explanation: string;
  };
  pillow_product: {
    id: number;
    size: string;
    kind: string;
  };
  variant: {
    id: string;
    product_id: string;
    price: number;
    currency: string;
  } | null;
  components: {
    covers: ComponentOption[];
    cases: ComponentOption[];
    protectors: ComponentOption[];
    packaging: ComponentOption[];
  };
  templates: {
    id: number;
    name: string;
    lines: { item_id: number; subtype: string; quantity: number }[];
  }[];
  available_fillings: {
    item_id: number;
    subtype: string;
    name: string;
    on_hand: number;
  }[];
}

// ─── Shared Constants ────────────────────────────────────────

import { HARDCODED_UPSELLS } from "@/lib/shop/customize-apply-payload";

export { HARDCODED_UPSELLS };

// ─── Shared Utilities ────────────────────────────────────────

export const formatPrice = formatCurrency;

/**
 * Compute filling lines from recommendation data + optional template selection.
 */
export function computeFillingLines(
  data: RecommendationResponseData | null,
  selectedTemplateId: number | null
): FillingLine[] {
  if (!data) return [];
  if (selectedTemplateId) {
    const template = data.templates.find((t) => t.id === selectedTemplateId);
    if (template) {
      return template.lines.map((line) => {
        const filling = data.available_fillings.find(
          (f) => f.item_id === line.item_id
        );
        return {
          item_id: line.item_id,
          subtype: line.subtype ?? filling?.subtype ?? "",
          name: filling?.name ?? `Filling #${line.item_id}`,
          quantity: line.quantity,
        };
      });
    }
  }
  return data.recommendation.filling_lines;
}

/**
 * Compute component lines from recommendation + user selections.
 */
export function computeComponentLines(
  data: RecommendationResponseData | null,
  selectedCover: number | null,
  selectedCase: number | null,
  componentQtyOverrides: Map<number, number>
): ConfigLine[] {
  if (!data) return [];
  const { covers, cases, protectors, packaging } = data.components;
  const allComponents = [...covers, ...cases, ...protectors, ...packaging];
  const lines: ConfigLine[] = [];

  for (const comp of allComponents) {
    const isSelectedCover =
      comp.category === "cover" && comp.item_id === selectedCover;
    const isSelectedCase =
      comp.category === "case" && comp.item_id === selectedCase;
    const isDefaultCover =
      comp.category === "cover" &&
      selectedCover === null &&
      comp.base_quantity > 0;
    const isDefaultCase =
      comp.category === "case" &&
      selectedCase === null &&
      comp.base_quantity > 0;
    const isOther =
      comp.category !== "cover" &&
      comp.category !== "case" &&
      comp.base_quantity > 0;

    if (
      isSelectedCover ||
      isSelectedCase ||
      isDefaultCover ||
      isDefaultCase ||
      isOther
    ) {
      const overrideQty = componentQtyOverrides.get(comp.item_id);
      const qty = overrideQty ?? comp.base_quantity;
      lines.push({
        item_id: comp.item_id,
        category: comp.category,
        subtype: comp.subtype,
        name: comp.name,
        size: comp.size,
        quantity: qty,
        is_addon: qty > comp.base_quantity,
        price_delta: comp.unit_price,
      });
    }
  }

  return lines;
}

/**
 * Compute addon price from component lines vs base quantities.
 */
export function computeAddonPrice(
  data: RecommendationResponseData | null,
  componentLines: ConfigLine[]
): number {
  if (!data) return 0;
  let total = 0;
  const allComps = [
    ...data.components.covers,
    ...data.components.cases,
    ...data.components.protectors,
    ...data.components.packaging,
  ];
  for (const line of componentLines) {
    const comp = allComps.find((c) => c.item_id === line.item_id);
    if (!comp) continue;
    const extra = Math.max(0, line.quantity - comp.base_quantity);
    if (extra > 0) {
      total += extra * comp.unit_price;
    }
  }
  return total;
}

/**
 * Compute upsell total.
 */
export function computeUpsellTotal(
  selectedUpsells: Set<number>,
  upsells: UpsellItem[] = HARDCODED_UPSELLS
): number {
  let total = 0;
  for (const upsell of upsells) {
    if (selectedUpsells.has(upsell.item_id)) {
      total += upsell.price * upsell.quantity;
    }
  }
  return total;
}

// ─── Step: Recommendation ────────────────────────────────────

export interface CustomizationStepRecommendationProps {
  data: RecommendationResponseData;
  selectedTemplateId: number | null;
  onSelectTemplate: (id: number | null) => void;
  fillingLines: FillingLine[];
  currency: string;
  basePrice: number;
  onContinue: () => void;
  productLabel?: string;
}

export function CustomizationStepRecommendation({
  data,
  selectedTemplateId,
  onSelectTemplate,
  fillingLines,
  currency,
  basePrice,
  onContinue,
  productLabel,
}: CustomizationStepRecommendationProps) {
  const { recommendation, templates, pillow_product } = data;

  return (
    <div className="space-y-6">
      {/* Recommended size - large prominent display */}
      <div className="text-center space-y-2">
        <Badge variant="secondary" className="text-xs">
          AI Recommended
        </Badge>
        <h2 className="text-3xl font-bold tracking-tight">
          Size {pillow_product.size}
        </h2>
        <p className="text-sm text-muted-foreground capitalize">
          {productLabel ?? `${pillow_product.kind} pillow`}
        </p>
        {basePrice > 0 && (
          <p className="text-lg font-semibold text-primary">
            {formatPrice(basePrice, currency)}
          </p>
        )}
      </div>

      {/* Filling configuration */}
      {fillingLines.length > 0 && (
        <Card className="py-4">
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Filling Configuration</h3>
              {selectedTemplateId === null && (
                <Badge variant="outline" className="text-xs">
                  AI Pick
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {fillingLines.map((fl, idx) => (
                <div
                  key={idx}
                  className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-sm"
                >
                  <span className="font-semibold">{fl.quantity}x</span>
                  <span>{fl.subtype || fl.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Explanation */}
      <div className="rounded-lg bg-muted/50 p-4 text-sm leading-relaxed text-muted-foreground">
        {recommendation.explanation}
      </div>

      {/* Alternative templates */}
      {templates.length > 0 && (
        <div className="space-y-3">
          <Label className="text-sm font-semibold">
            Or choose a preset configuration
          </Label>
          <div className="space-y-2">
            {templates.map((template) => {
              const isSelected = selectedTemplateId === template.id;
              const fillingDesc = template.lines
                .map((l) => `${l.quantity}x ${l.subtype}`)
                .join(", ");

              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() =>
                    onSelectTemplate(isSelected ? null : template.id)
                  }
                  className={cn(
                    "w-full flex items-center justify-between rounded-lg border-2 p-3 text-left transition-all",
                    "hover:border-primary/50",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  )}
                >
                  <div>
                    <p className="font-medium text-sm">{template.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fillingDesc}
                    </p>
                  </div>
                  {isSelected && <Check className="size-4 text-primary shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Continue */}
      <Button className="w-full" size="lg" onClick={onContinue}>
        Continue to Customize
        <ArrowRight className="size-4" />
      </Button>
    </div>
  );
}

// ─── Step: Components ────────────────────────────────────────

export interface CustomizationStepComponentsProps {
  components: RecommendationResponseData["components"];
  selectedCover: number | null;
  onSelectCover: (id: number) => void;
  selectedCase: number | null;
  onSelectCase: (id: number) => void;
  componentQtyOverrides: Map<number, number>;
  onQtyChange: (itemId: number, qty: number) => void;
  currency: string;
  basePrice: number;
  addonPrice: number;
  onBack: () => void;
  onContinue: () => void;
  /**
   * Cover + case only (no protector, packaging, or qty adjusters).
   * Used by the authorize-then-capture purchase path.
   */
  preferencesOnly?: boolean;
  /** Show only the case preference picker (Mbolster). */
  caseOnly?: boolean;
  /** Hide back/continue row when the parent owns navigation. */
  hideNav?: boolean;
  continueLabel?: string;
}

function ComponentOptionButton({
  name,
  subtype,
  stockAvailable,
  isSelected,
  onSelect,
  /** Hold path: stock is checked at assign/accept, so sold-out stays selectable. */
  allowSoldOut = false,
}: {
  name: string;
  subtype?: string;
  stockAvailable: number;
  isSelected: boolean;
  onSelect: () => void;
  allowSoldOut?: boolean;
}) {
  const isSoldOut = stockAvailable <= 0;
  const disabled = isSoldOut && !allowSoldOut;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "w-full flex items-center justify-between rounded-lg border-2 p-3 transition-all",
        "hover:border-primary/50",
        isSelected ? "border-primary bg-primary/5" : "border-border",
        disabled && "opacity-50 cursor-not-allowed hover:border-border",
      )}
    >
      <div className="text-left">
        <p className="font-medium text-sm">{name}</p>
        {subtype && <p className="text-xs text-muted-foreground">{subtype}</p>}
      </div>
      <div className="flex items-center gap-2">
        {isSoldOut ? (
          <Badge variant="outline" className="text-xs text-muted-foreground">
            {allowSoldOut ? "Low stock" : "Sold out"}
          </Badge>
        ) : stockAvailable <= 5 ? (
          <Badge variant="outline" className="text-xs text-amber-600">
            Low stock
          </Badge>
        ) : null}
        {isSelected && <Check className="size-4 text-primary shrink-0" />}
      </div>
    </button>
  );
}

export function CustomizationStepComponents({
  components,
  selectedCover,
  onSelectCover,
  selectedCase,
  onSelectCase,
  componentQtyOverrides,
  onQtyChange,
  currency,
  basePrice,
  addonPrice,
  onBack,
  onContinue,
  preferencesOnly = false,
  caseOnly = false,
  hideNav = false,
  continueLabel = "Review & Add to Cart",
}: CustomizationStepComponentsProps) {
  return (
    <div className="space-y-6">
      {/* Cover style picker */}
      {!caseOnly && (
        <div className="space-y-3">
          <Label className="text-base font-semibold">Cover Style</Label>
          {components.covers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No covers available for this size.
            </p>
          ) : (
            <div className="space-y-2">
              {components.covers.map((cover) => (
                <ComponentOptionButton
                  key={cover.item_id}
                  name={cover.name}
                  subtype={cover.subtype}
                  stockAvailable={cover.stock_available}
                  isSelected={selectedCover === cover.item_id}
                  onSelect={() => onSelectCover(cover.item_id)}
                  allowSoldOut={preferencesOnly}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Case style picker — always shown (empty state if none) so Case is never missing */}
      <div className="space-y-3">
        <Label className="text-base font-semibold">Case Style</Label>
        {components.cases.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No cases available for this size. Check inventory for active case items matching the recommended size.
          </p>
        ) : (
          <div className="space-y-2">
            {components.cases.map((caseItem) => (
              <ComponentOptionButton
                key={caseItem.item_id}
                name={caseItem.name}
                subtype={caseItem.subtype}
                stockAvailable={caseItem.stock_available}
                isSelected={selectedCase === caseItem.item_id}
                onSelect={() => onSelectCase(caseItem.item_id)}
                allowSoldOut={preferencesOnly}
              />
            ))}
          </div>
        )}
      </div>

      {!preferencesOnly && (
        <>
          {/* Quantity adjusters for all selected components */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Quantities</Label>
            <p className="text-xs text-muted-foreground">
              Adjust quantities beyond the included base amount. Extra items are
              charged individually.
            </p>
            <div className="space-y-3">
              {[
                ...components.covers,
                ...components.cases,
                ...components.protectors,
                ...components.packaging,
              ]
                .filter((comp) => {
                  if (comp.category === "cover")
                    return comp.item_id === selectedCover;
                  if (comp.category === "case")
                    return comp.item_id === selectedCase;
                  return comp.base_quantity > 0;
                })
                .map((comp) => {
                  const currentQty =
                    componentQtyOverrides.get(comp.item_id) ?? comp.base_quantity;
                  const extraQty = Math.max(0, currentQty - comp.base_quantity);
                  const extraCost = extraQty * comp.unit_price;

                  return (
                    <div
                      key={comp.item_id}
                      className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{comp.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Base: {comp.base_quantity} included
                          {comp.unit_price > 0 && (
                            <> &middot; {formatPrice(comp.unit_price, currency)} each extra</>
                          )}
                        </p>
                        {extraCost > 0 && (
                          <p className="text-xs font-medium text-primary mt-0.5">
                            +{formatPrice(extraCost, currency)}
                          </p>
                        )}
                      </div>
                      <QuantitySelector
                        value={currentQty}
                        onChange={(qty) => onQtyChange(comp.item_id, qty)}
                        min={comp.category === "cover" || comp.category === "case" ? 1 : 0}
                        max={comp.stock_available}
                      />
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Price summary bar */}
          <div className="rounded-lg bg-muted/50 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Base price</span>
              <span>{formatPrice(basePrice, currency)}</span>
            </div>
            {addonPrice > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Add-ons</span>
                <span className="text-primary">
                  +{formatPrice(addonPrice, currency)}
                </span>
              </div>
            )}
            <div className="flex justify-between font-semibold border-t pt-2">
              <span>Subtotal</span>
              <span>{formatPrice(basePrice + addonPrice, currency)}</span>
            </div>
          </div>
        </>
      )}

      {/* Navigation */}
      {!hideNav && (
        <div className="flex gap-3">
          <Button variant="outline" onClick={onBack} className="flex-1">
            <ArrowLeft className="size-4" />
            Back
          </Button>
          <Button onClick={onContinue} className="flex-[2]">
            {continueLabel}
            <ArrowRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Step: Summary & Upsells ─────────────────────────────────

export interface CustomizationStepSummaryProps {
  data: RecommendationResponseData;
  fillingLines: FillingLine[];
  componentLines: ConfigLine[];
  selectedCover: number | null;
  selectedCase: number | null;
  basePrice: number;
  addonPrice: number;
  upsellTotal: number;
  totalPrice: number;
  currency: string;
  selectedUpsells: Set<number>;
  onToggleUpsell: (itemId: number) => void;
  isLoading: boolean;
  onBack: () => void;
  onAddToCart: () => void;
  upsells?: UpsellItem[];
  productLabel?: string;
}

export function CustomizationStepSummary({
  data,
  fillingLines,
  componentLines,
  selectedCover,
  selectedCase,
  basePrice,
  addonPrice,
  upsellTotal,
  totalPrice,
  currency,
  selectedUpsells,
  onToggleUpsell,
  isLoading,
  onBack,
  onAddToCart,
  upsells = HARDCODED_UPSELLS,
  productLabel,
}: CustomizationStepSummaryProps) {
  const coverName =
    data.components.covers.find(
      (c) => c.item_id === selectedCover
    )?.name ?? "Default";
  const caseName =
    data.components.cases.find(
      (c) => c.item_id === selectedCase
    )?.name ?? "Default";

  const fillingDesc = fillingLines
    .map((fl) => `${fl.quantity}x ${fl.subtype || fl.name}`)
    .join(", ");

  return (
    <div className="space-y-6">
      {/* Order summary card */}
      <Card className="py-4">
        <CardContent className="space-y-4">
          <h3 className="font-semibold">Order Summary</h3>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                {productLabel ? "Product" : "Pillow size"}
              </span>
              <span className="font-medium">
                {data.pillow_product.size}{" "}
                <span className="text-muted-foreground capitalize">
                  ({productLabel ?? data.pillow_product.kind})
                </span>
              </span>
            </div>

            {fillingDesc && (
              <div className="flex justify-between items-start">
                <span className="text-muted-foreground">Filling</span>
                <span className="font-medium text-right max-w-[60%]">
                  {fillingDesc}
                </span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-muted-foreground">Cover</span>
              <span className="font-medium">{coverName}</span>
            </div>

            <div className="flex justify-between">
              <span className="text-muted-foreground">Case</span>
              <span className="font-medium">{caseName}</span>
            </div>

            {/* Extra quantities */}
            {componentLines
              .filter((cl) => {
                const comp = [
                  ...data.components.covers,
                  ...data.components.cases,
                  ...data.components.protectors,
                  ...data.components.packaging,
                ].find((c) => c.item_id === cl.item_id);
                return comp && cl.quantity > comp.base_quantity;
              })
              .map((cl) => {
                const comp = [
                  ...data.components.covers,
                  ...data.components.cases,
                  ...data.components.protectors,
                  ...data.components.packaging,
                ].find((c) => c.item_id === cl.item_id)!;
                const extra = cl.quantity - comp.base_quantity;
                return (
                  <div
                    key={cl.item_id}
                    className="flex justify-between text-xs"
                  >
                    <span className="text-muted-foreground">
                      +{extra} extra {cl.name}
                    </span>
                    <span className="text-primary">
                      +{formatPrice(extra * comp.unit_price, currency)}
                    </span>
                  </div>
                );
              })}
          </div>

          {/* Price breakdown */}
          <div className="border-t pt-3 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Base price</span>
              <span>{formatPrice(basePrice, currency)}</span>
            </div>
            {addonPrice > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Component add-ons
                </span>
                <span className="text-primary">
                  +{formatPrice(addonPrice, currency)}
                </span>
              </div>
            )}
            {upsellTotal > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Extras</span>
                <span className="text-primary">
                  +{formatPrice(upsellTotal, currency)}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Upsells */}
      {upsells.length > 0 && (
        <div className="space-y-3">
          <Label className="text-base font-semibold">
            Complete your setup
          </Label>
          <div className="space-y-2">
            {upsells.map((upsell) => {
              const isSelected = selectedUpsells.has(upsell.item_id);
              return (
                <button
                  key={upsell.item_id}
                  type="button"
                  onClick={() => onToggleUpsell(upsell.item_id)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-lg border-2 p-3 text-left transition-all",
                    "hover:border-primary/50",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  )}
                >
                  <div
                    className={cn(
                      "flex size-5 items-center justify-center rounded border-2 shrink-0 transition-colors",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted-foreground/30"
                    )}
                  >
                    {isSelected && <Check className="size-3" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{upsell.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {upsell.discount_pct}% off &mdash; save{" "}
                      {formatPrice(
                        upsell.original_price - upsell.price,
                        currency
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">
                      {formatPrice(upsell.price, currency)}
                    </p>
                    <p className="text-xs text-muted-foreground line-through">
                      {formatPrice(upsell.original_price, currency)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Total */}
      <div className="rounded-lg bg-primary/5 border-2 border-primary/20 p-4">
        <div className="flex justify-between items-center">
          <span className="font-semibold text-lg">Total</span>
          <span className="font-bold text-2xl text-primary">
            {formatPrice(totalPrice, currency)}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={onBack} className="flex-1">
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button
          onClick={onAddToCart}
          disabled={isLoading}
          className="flex-[2]"
          size="lg"
        >
          {isLoading ? (
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
      </div>
    </div>
  );
}
