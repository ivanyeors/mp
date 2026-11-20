"use client";

import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export function PresetPicker<V extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  size = "sm",
}: {
  label: string;
  value: V;
  options: readonly { value: V; label: string }[];
  onChange: (next: V) => void;
  disabled?: boolean;
  size?: "sm" | "xs";
}) {
  const group = useRef<HTMLDivElement>(null);
  const at = Math.max(0, options.findIndex((o) => o.value === value));
  const choose = (i: number) => {
    const o = options[(i + options.length) % options.length];
    onChange(o.value);
    group.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[options.indexOf(o)]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") choose(at + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") choose(at - 1);
    else return;
    e.preventDefault();
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div ref={group} role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className="inline-flex rounded-md border bg-background p-0.5">
        {options.map((o, i) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={i === at}
            tabIndex={i === at ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded px-2.5 font-medium text-muted-foreground transition-colors hover:text-foreground aria-checked:bg-accent aria-checked:text-foreground disabled:opacity-50 max-md:min-h-11",
              size === "sm" ? "h-7 text-xs" : "h-6 text-[11px]",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
