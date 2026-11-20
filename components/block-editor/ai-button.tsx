"use client";

import { useId, useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { Loader2, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function AiButton({
  children,
  onClick,
  working = null,
  disabledReason = null,
  onStop,
  variant = "outline",
  size = "sm",
  className,
  ...button
}: Omit<ComponentProps<"button">, "children" | "onClick"> & {
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  working?: string | null;
  disabledReason?: string | null;
  onStop?: () => void;
  variant?: "outline" | "default" | "ghost" | "secondary";
  size?: "sm" | "default";
  className?: string;
}) {
  const whyId = useId();
  const [tipOpen, setTipOpen] = useState(false);
  const off = Boolean(disabledReason) && !working;

  if (working) {
    return (
      <span className={cn("inline-flex items-center gap-1", className)}>
        <Button {...button} type="button" variant={variant} size={size} aria-disabled aria-busy className="cursor-progress">
          <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden />
          <span role="status" aria-live="polite">
            {working}
          </span>
        </Button>
        {onStop ? (
          <Button type="button" variant="ghost" size={size} onClick={onStop}>
            <Square className="mr-1 h-3.5 w-3.5" aria-hidden />
            Stop
          </Button>
        ) : null}
      </span>
    );
  }

  return (
    <>
      <Tooltip open={tipOpen && off} onOpenChange={setTipOpen}>
        <TooltipTrigger asChild>
          <Button
            {...button}
            type="button"
            variant={variant}
            size={size}
            onClick={(e) => {
              if (!off) onClick?.(e);
            }}
            aria-disabled={off || undefined}
            aria-describedby={off ? whyId : button["aria-describedby"]}
            className={cn("aria-disabled:cursor-not-allowed aria-disabled:opacity-50", className)}
          >
            <Sparkles className="mr-1 h-4 w-4" aria-hidden />
            {children}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{disabledReason}</TooltipContent>
      </Tooltip>
      {off ? (
        <span id={whyId} className="sr-only">
          {disabledReason}
        </span>
      ) : null}
    </>
  );
}
