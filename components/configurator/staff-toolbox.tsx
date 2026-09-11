"use client";

import * as React from "react";
import { Check, ChevronDown, Wrench } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toolDisplay, type ToolOption } from "./staff-toolbox-display";

export type { ToolOption };

export type ToolSpec = {
  id: string;
  /** Micro-label above the value; also the chip's accessible name. */
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  options: readonly ToolOption[];
  onSelect?: (value: string) => void;
  /** Shown when nothing is selected, or when `options` is empty. */
  placeholder?: string;
  disabled?: boolean;
  /** A value the surface derives rather than one staff pick — no popover. */
  readOnly?: boolean;
  /** "segmented" wraps short options into pills; "list" stacks long names. */
  layout?: "segmented" | "list";
};

export type ToolboxStatus = { label: string; tone: "synced" | "edited" };

/**
 * Staff toolbox: a floating instrument rail for the configurator stage.
 *
 * Tools are data, not markup — each entry renders the same chip (icon,
 * micro-label, current value) that opens a picker, so a new control is one
 * more array entry and the rail wraps to a second row on its own. Shared by
 * the pillow and bolster staff panels.
 */
export function StaffToolbox({
  tools,
  status,
  action,
  children,
}: {
  tools: ToolSpec[];
  /** Right-hand state pill (template sync), when there is one. */
  status?: ToolboxStatus | null;
  /** Trailing action for the rail (e.g. save the edited mix). */
  action?: React.ReactNode;
  /** Slot for whatever the panel owns beyond the rail (e.g. its confirm gate). */
  children?: React.ReactNode;
}) {
  return (
    <div className="w-fit max-w-xl">
      <div
        className={cn(
          "flex flex-wrap items-stretch gap-1 rounded-2xl p-1.5",
          "border border-border/60 bg-background/70 shadow-xl backdrop-blur-xl",
          "ring-1 ring-inset ring-white/5",
        )}
      >
        <span
          title="Staff assist"
          className="flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl bg-amber-500/10 px-2 text-amber-600 dark:text-amber-400"
        >
          <Wrench className="size-4" aria-hidden />
          <span className="text-[9px] font-semibold uppercase tracking-widest">Staff</span>
        </span>

        {tools.map((tool) => (
          <ToolChip key={tool.id} tool={tool} />
        ))}

        {status ? (
          <span
            className="flex shrink-0 items-center gap-1.5 self-center rounded-xl px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
            title={status.tone === "synced" ? "Mix matches the loaded template" : "Mix edited since load"}
          >
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                status.tone === "synced" ? "bg-emerald-500" : "bg-amber-500",
              )}
            />
            {status.label}
          </span>
        ) : null}

        {action}
      </div>
      {children}
    </div>
  );
}

function ToolChip({ tool }: { tool: ToolSpec }) {
  const [open, setOpen] = React.useState(false);
  const display = toolDisplay(tool.value, tool.options, tool.placeholder);
  const Icon = tool.icon;
  const inert = tool.readOnly || tool.disabled || tool.options.length === 0;

  const face = (
    <>
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
          {tool.label}
        </span>
        <span
          className={cn(
            "block truncate text-sm leading-tight",
            display.isPlaceholder ? "text-muted-foreground" : "font-medium",
          )}
        >
          {display.label}
        </span>
      </span>
    </>
  );

  const chipClass =
    "flex min-w-[6.5rem] flex-1 basis-[7.5rem] items-center gap-2 rounded-xl px-2.5 py-1.5 text-left";

  if (tool.readOnly) {
    return <span className={chipClass}>{face}</span>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={tool.label}
          disabled={inert}
          className={cn(
            chipClass,
            "transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent",
            open && "bg-foreground/10",
          )}
        >
          {face}
          <ChevronDown
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className={cn("p-1.5", tool.layout === "list" ? "w-64" : "w-auto min-w-[10rem]")}
      >
        {tool.layout === "list" ? (
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {tool.options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  setOpen(false);
                  tool.onSelect?.(o.value);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
              >
                <span className="min-w-0">
                  <span className="block truncate">{o.label}</span>
                  {o.hint ? (
                    <span className="block truncate text-xs text-muted-foreground">{o.hint}</span>
                  ) : null}
                </span>
                {o.value === tool.value ? <Check className="size-4 shrink-0" aria-hidden /> : null}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1">
            {tool.options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  setOpen(false);
                  tool.onSelect?.(o.value);
                }}
                className={cn(
                  "min-w-9 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                  o.value === tool.value
                    ? "bg-foreground text-background"
                    : "hover:bg-accent",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
