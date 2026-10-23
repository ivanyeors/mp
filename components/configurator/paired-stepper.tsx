"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type PairedStep = 1 | 2 | 3 | 4;

type PairedStepperProps = { step: PairedStep; bolsterSkipped?: boolean };

/**
 * The stepper along the top of the page, wherever a Paired build runs: under
 * the preview header on both configurators, and above the Mbolster's height
 * step. 44px tall (`h-11`); the pages' sticky offsets allow for it.
 */
export function PairedStepperBar({ className, ...props }: PairedStepperProps & { className?: string }) {
  return (
    <div className={cn("bg-background/95", className)}>
      <div className="mx-auto flex h-11 max-w-[1400px] items-center justify-center px-4 max-md:px-3">
        <PairedStepper {...props} />
      </div>
    </div>
  );
}

/**
 * "1 Mpillow · 2 Mbolster (optional) · 3 Details · 4 Review" — where a Paired
 * build's shopper is (ADR 0026). Both builds come before details and payment.
 * Shown on the Mpillow preview, on the Mbolster page it hands to, and on the
 * Mpillow's details and review that follow. Phones name the current step only.
 */
export function PairedStepper({ step, bolsterSkipped = false }: PairedStepperProps) {
  const steps = [
    { n: 1, label: "Mpillow" },
    { n: 2, label: "Mbolster", note: bolsterSkipped ? "skipped" : step <= 2 ? "optional" : null },
    { n: 3, label: "Details" },
    { n: 4, label: "Review" },
  ] as const;
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" aria-label="Your order">
      {steps.map((s, i) => {
        const current = s.n === step;
        const skipped = s.n === 2 && bolsterSkipped;
        const done = s.n < step && !skipped;
        return (
          <li key={s.n} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden className="h-px w-4 bg-border" /> : null}
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                current && "border-primary bg-primary text-primary-foreground",
                done && "border-primary text-primary",
                skipped && "border-dashed text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" /> : s.n}
            </span>
            <span className={cn(current ? "font-medium" : "text-muted-foreground max-sm:sr-only")}>
              {s.label}
              {"note" in s && s.note ? <span className="text-muted-foreground"> ({s.note})</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
