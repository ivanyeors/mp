"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type SingleSelectOption = { value: string; label: string };

/** Cover-style full-width single-select rows (same language as Cover Style). */
export function SingleSelectOptionRows({
  options,
  value,
  onChange,
  invalid = false,
}: {
  options: SingleSelectOption[];
  value: string;
  onChange: (value: string) => void;
  /** Slice 03: field error border when submit fails. */
  invalid?: boolean;
}) {
  return (
    <div className="space-y-2" role="radiogroup">
      {options.map((opt) => {
        const isSelected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(opt.value)}
            className={cn(
              "w-full flex items-center justify-between rounded-lg border-2 p-3 transition-all",
              "hover:border-primary/50",
              isSelected ? "border-primary bg-primary/5" : "border-border",
              invalid && !isSelected && "border-destructive",
            )}
          >
            <p className="font-medium text-sm text-left">{opt.label}</p>
            {isSelected && <Check className="size-4 text-primary shrink-0" />}
          </button>
        );
      })}
    </div>
  );
}

export const GENDER_OPTIONS: SingleSelectOption[] = [
  { value: "female", label: "Female" },
  { value: "male", label: "Male" },
];

export const AGE_GROUP_OPTIONS: SingleSelectOption[] = [
  { value: "under-18", label: "Under 18" },
  { value: "18-24", label: "18–24" },
  { value: "25-34", label: "25–34" },
  { value: "35-44", label: "35–44" },
  { value: "45-54", label: "45–54" },
  { value: "55-64", label: "55–64" },
  { value: "65-plus", label: "65+" },
];

export const BLOOD_PRESSURE_OPTIONS: SingleSelectOption[] = [
  { value: "normal", label: "Normal" },
  { value: "low-blood", label: "Low Blood" },
  { value: "high-blood", label: "High Blood" },
  { value: "unsure", label: "Unsure" },
];

export const BED_FIRMNESS_OPTIONS: SingleSelectOption[] = [
  { value: "soft", label: "Soft" },
  { value: "medium-soft", label: "Medium Soft" },
  { value: "firm", label: "Firm" },
];
