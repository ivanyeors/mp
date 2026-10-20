"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "1 Mpillow · 2 Mbolster (optional)" — where a Paired build's shopper is
 * (ADR 0026). Shown on the Mpillow preview and on the Mbolster page it hands to.
 */
export function PairedStepper({ step }: { step: 1 | 2 }) {
  const steps = [
    { n: 1, label: "Mpillow" },
    { n: 2, label: "Mbolster", note: "optional" },
  ] as const;
  return (
    <ol className="flex items-center gap-2 text-sm" aria-label="Your order">
      {steps.map((s, i) => {
        const current = s.n === step;
        const done = s.n < step;
        return (
          <li key={s.n} className="flex items-center gap-2">
            {i > 0 ? <span aria-hidden className="h-px w-6 bg-border" /> : null}
            <span
              aria-current={current ? "step" : undefined}
              className={cn(
                "flex size-6 items-center justify-center rounded-full border text-xs",
                current && "border-primary bg-primary text-primary-foreground",
                done && "border-primary text-primary",
              )}
            >
              {done ? <Check className="size-3.5" /> : s.n}
            </span>
            <span className={cn(current ? "font-medium" : "text-muted-foreground")}>
              {s.label}
              {"note" in s ? <span className="text-muted-foreground"> ({s.note})</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
