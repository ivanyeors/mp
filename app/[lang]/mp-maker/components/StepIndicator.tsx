"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useBuilder, type BuilderStep } from "./BuilderProvider";

const STEPS: { key: BuilderStep; label: string }[] = [
  { key: "preferences", label: "About You" },
  { key: "recommendation", label: "Your Pillow" },
  { key: "components", label: "Customize" },
  { key: "summary", label: "Review" },
];

export function StepIndicator() {
  const { stepIndex, productType } = useBuilder();

  const steps = STEPS.map((s) =>
    s.key === "recommendation" && productType === "bolster"
      ? { ...s, label: "Your Bolster" }
      : s
  );

  return (
    <div className="flex items-center gap-1 w-full px-1">
      {steps.map((s, idx) => {
        const isCompleted = idx < stepIndex;
        const isCurrent = idx === stepIndex;

        return (
          <div key={s.key} className="flex items-center flex-1 last:flex-initial">
            {/* Dot + label */}
            <div className="flex flex-col items-center gap-1 min-w-0">
              <div className="relative">
                <div
                  className={cn(
                    "size-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors duration-300",
                    isCompleted
                      ? "bg-primary text-primary-foreground"
                      : isCurrent
                        ? "bg-primary/20 text-primary border-2 border-primary"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {isCompleted ? (
                    <svg className="size-3.5" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </div>
              </div>
              <span
                className={cn(
                  "text-[10px] leading-tight text-center whitespace-nowrap transition-colors",
                  isCurrent ? "font-semibold text-foreground" : "text-muted-foreground"
                )}
              >
                {s.label}
              </span>
            </div>

            {/* Connecting line */}
            {idx < steps.length - 1 && (
              <div className="flex-1 h-[2px] bg-muted mx-1.5 mt-[-16px] relative overflow-hidden rounded-full">
                <motion.div
                  className="absolute inset-y-0 left-0 bg-primary rounded-full"
                  initial={false}
                  animate={{ width: isCompleted ? "100%" : "0%" }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
