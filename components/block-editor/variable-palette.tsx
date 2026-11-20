"use client";

import { useCallback, useId, useState, type DragEvent, type ReactNode } from "react";
import { Braces } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RichTextVariable } from "./rich-text-doc";
import { VARIABLE_CHIP } from "./rich-text-style";
import { useVariableTargets } from "./variable-targets";

export const variableDragHtml = (key: string) => `<span data-variable="${key.replace(/[^a-z0-9_]/g, "")}"></span>`;

export function VariablePalette({
  variables,
  hint = "Drag one into the words, or click where it goes and choose it.",
  draggable = true,
  onInserted,
  children,
  className,
}: {
  variables: readonly RichTextVariable[];
  hint?: ReactNode;
  draggable?: boolean;
  onInserted?: () => void;
  children?: ReactNode;
  className?: string;
}) {
  const targets = useVariableTargets();
  const uid = useId();
  const [said, setSaid] = useState({ text: "", n: 0 });
  const say = useCallback((text: string) => setSaid((s) => ({ text, n: s.n + 1 })), []);

  const put = (v: RichTextVariable) => {
    if (v.disabledReason) return say(`${v.label}: ${v.disabledReason}.`);
    const target = targets?.current();
    if (!target || !target.insert(v)) return say(`Click into the words where ${v.label} goes, then choose it again.`);
    say(`${v.label} added to ${target.name}.`);
    onInserted?.();
  };
  const drag = (v: RichTextVariable) => (e: DragEvent) => {
    e.dataTransfer.setData("text/html", variableDragHtml(v.key));
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <div className={cn("space-y-3", className)}>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <ul className="space-y-1.5" aria-label="Variables">
        {variables.map((v) => {
          const off = Boolean(v.disabledReason);
          return (
            <li key={v.key}>
              <button
                type="button"
                draggable={draggable && !off}
                onDragStart={draggable && !off ? drag(v) : undefined}
                onClick={() => put(v)}
                aria-disabled={off || undefined}
                aria-describedby={`${uid}-${v.key}`}
                className={cn(
                  "flex w-full items-start gap-2 rounded-md border bg-background px-2.5 py-2 text-left text-sm shadow-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 max-md:min-h-11",
                  draggable && !off && "cursor-grab active:cursor-grabbing",
                )}
              >
                <Braces className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0">
                  <span className={cn(VARIABLE_CHIP, "mx-0")}>{v.label}</span>
                  <span id={`${uid}-${v.key}`} className="mt-1 block text-xs text-muted-foreground">
                    {v.disabledReason ?? v.description}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {children}
      <div role="status" aria-live="polite" className="sr-only">
        <span key={said.n}>{said.text}</span>
      </div>
    </div>
  );
}
