"use client";

import { useId, useState, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { Loader2, Sparkles, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The ✨ button (PRD-campaign-email-editor slice 04): idle, working with
 * words for what it is doing (*Reading your brief…*, then *Writing the
 * email…*), or turned off with the reason. It calls nothing itself: slices
 * 09, 10 and 17 hand it what to do. Off, it stays in the tab order with its
 * reason, as Clear all does, so a keyboard user can reach why.
 *
 * Its ref and any other button props reach the button, so it can be a
 * popover's trigger (`<PopoverTrigger asChild>`), as slice 09's is.
 */
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
  /** What it does: *Generate*, *Rewrite*, *Translate to Chinese*. */
  children: ReactNode;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  /** While it works, what it is doing now; null when idle. */
  working?: string | null;
  /** Why it can't be pressed now; null when it can. */
  disabledReason?: string | null;
  /** While it works, a Stop beside it. */
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
