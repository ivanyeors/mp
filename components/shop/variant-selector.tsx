"use client";

import { cn } from "@/lib/utils";
import type { ProductVariant, ProductOption } from "@/lib/types/ecommerce";

interface VariantSelectorProps {
  variants: ProductVariant[];
  options?: ProductOption[];
  selected?: string;
  onSelect: (variantId: string) => void;
}

function findBestVariant(
  variants: ProductVariant[],
  currentVariantId: string | undefined,
  axisIndex: number,
  newValue: string
): ProductVariant | null {
  const current = variants.find((v) => v.id === currentVariantId);
  const optionKeys = ["option1", "option2", "option3"] as const;

  const candidates = variants.filter((v) => {
    const key = optionKeys[axisIndex];
    return v[key] === newValue;
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  if (!current) return candidates[0];

  const scored = candidates.map((v) => {
    let score = 0;
    optionKeys.forEach((key, i) => {
      if (i !== axisIndex && v[key] === current[key]) score++;
    });
    return { v, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].v;
}

export function VariantSelector({
  variants,
  options,
  selected,
  onSelect,
}: VariantSelectorProps) {
  const activeVariants = variants.filter((v) => v.is_active);

  type Axis = { name: string; values: string[]; axisIndex: number };
  const axes: Axis[] = [];

  const optionKeys = ["option1", "option2", "option3"] as const;

  optionKeys.forEach((key, i) => {
    const seen = new Set<string>();
    activeVariants.forEach((v) => {
      const val = v[key];
      if (val != null && val.trim() !== "") seen.add(val);
    });
    if (seen.size === 0) return;

    const optionDef = options?.find((o) => o.position === i + 1);
    const name = optionDef?.name ?? `Option ${i + 1}`;

    const orderedValues = optionDef?.values?.length
      ? optionDef.values.filter((val) => seen.has(val))
      : [...seen].sort();

    axes.push({ name, values: orderedValues, axisIndex: i });
  });

  const selectedVariant = activeVariants.find((v) => v.id === selected);
  const currentSelections: Record<number, string | null> = {};
  axes.forEach(({ axisIndex }) => {
    const key = optionKeys[axisIndex];
    currentSelections[axisIndex] = selectedVariant?.[key] ?? null;
  });

  if (axes.length === 0) return null;

  return (
    <div className="flex flex-col gap-4">
      {axes.map(({ name, values, axisIndex }) => (
        <div key={axisIndex} className="flex flex-col gap-2">
          <span className="text-sm font-medium text-foreground">
            {name}
            {currentSelections[axisIndex] ? (
              <span className="ml-1.5 font-normal text-muted-foreground">
                — {currentSelections[axisIndex]}
              </span>
            ) : null}
          </span>

          <div className="flex flex-wrap gap-2">
            {values.map((value) => {
              const isSelected = currentSelections[axisIndex] === value;

              const optKey = optionKeys[axisIndex];
              const matchingVariants = activeVariants.filter(
                (v) => v[optKey] === value
              );
              const isAvailable = matchingVariants.length > 0;
              const isOutOfStock =
                isAvailable &&
                matchingVariants.every((v) => (v.stock_available ?? 0) <= 0);

              function handleClick() {
                const best = findBestVariant(
                  activeVariants,
                  selected,
                  axisIndex,
                  value
                );
                if (best) onSelect(best.id);
              }

              return (
                <button
                  key={value}
                  type="button"
                  onClick={handleClick}
                  disabled={!isAvailable || isOutOfStock}
                  aria-pressed={isSelected}
                  title={isOutOfStock ? "Out of stock" : undefined}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors",
                    "max-md:inline-flex max-md:min-h-11 max-md:min-w-11 max-md:items-center max-md:justify-center",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    isSelected
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-foreground hover:border-primary/60 hover:bg-accent",
                    isOutOfStock && !isSelected &&
                      "opacity-40 line-through cursor-not-allowed",
                    !isAvailable && "opacity-25 cursor-not-allowed"
                  )}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
