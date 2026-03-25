"use client";

import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuantitySelectorProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  className?: string;
}

export function QuantitySelector({
  value,
  onChange,
  min = 1,
  max,
  className,
}: QuantitySelectorProps) {
  const isAtMin = value <= min;
  const isAtMax = max != null && value >= max;

  function decrement() {
    if (!isAtMin) onChange(value - 1);
  }

  function increment() {
    if (!isAtMax) onChange(value + 1);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const parsed = parseInt(e.target.value, 10);
    if (isNaN(parsed)) return;
    const clamped = Math.max(min, max != null ? Math.min(max, parsed) : parsed);
    onChange(clamped);
  }

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-md border border-input bg-background",
        className
      )}
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        onClick={decrement}
        disabled={isAtMin}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-l-md transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          "disabled:pointer-events-none disabled:opacity-40"
        )}
      >
        <Minus className="size-4" />
      </button>

      <input
        type="number"
        aria-label="Quantity"
        value={value}
        onChange={handleInputChange}
        min={min}
        max={max}
        className={cn(
          "h-9 w-12 bg-transparent text-center text-sm font-medium",
          "focus:outline-none",
          // Hide browser spinners
          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        )}
      />

      <button
        type="button"
        aria-label="Increase quantity"
        onClick={increment}
        disabled={isAtMax}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-r-md transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          "disabled:pointer-events-none disabled:opacity-40"
        )}
      >
        <Plus className="size-4" />
      </button>
    </div>
  );
}
