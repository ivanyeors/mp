"use client"

import * as React from "react"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/** ponytail: single source for overlay dismiss hit area + safe-bottom on mobile */
export const overlayDismissButtonClassName =
  "ring-offset-background focus:ring-ring data-[state=open]:bg-secondary z-50 inline-flex shrink-0 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none min-h-11 min-w-11"

/**
 * Corner offsets shared by the positioned variants: bottom-right (thumb reach)
 * on mobile, top-right on md+.
 */
const overlayDismissCornerClassName =
  "bottom-[calc(0.75rem+var(--safe-bottom))] right-4 md:bottom-auto md:top-4 md:min-h-0 md:min-w-0 md:rounded-xs"

/**
 * When the X floats over content that scrolls underneath it (pinned variant)
 * give it a translucent backdrop on mobile so it stays legible.
 */
const overlayDismissFloatingClassName =
  "max-md:bg-background/80 max-md:backdrop-blur-sm max-md:supports-[backdrop-filter]:bg-background/60"

type OverlayDismissButtonProps = React.ComponentProps<"button"> & {
  label?: string
  /**
   * - "corner": `absolute` bottom-right on mobile, top-right on md+. Only correct
   *   when the overlay itself does NOT scroll (an absolute child scrolls away
   *   with the content of an `overflow-y-auto` container).
   * - "pinned": same corners but `fixed`, so the X stays put while the overlay
   *   scrolls its own content. For edge-anchored overlays (right / bottom
   *   sheets) whose corner coincides with the viewport corner.
   * - "inline": hug icon, no positioning.
   */
  variant?: "corner" | "pinned" | "inline"
}

export const OverlayDismissButton = React.forwardRef<
  HTMLButtonElement,
  OverlayDismissButtonProps
>(function OverlayDismissButton(
  { className, label = "Close", variant = "corner", type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      data-variant={variant}
      className={cn(
        overlayDismissButtonClassName,
        variant === "corner" && ["absolute", overlayDismissCornerClassName],
        variant === "pinned" && [
          "fixed",
          overlayDismissCornerClassName,
          overlayDismissFloatingClassName,
        ],
        variant === "inline" && "md:min-h-0 md:min-w-0",
        className
      )}
      {...props}
    >
      <XIcon className="size-5 md:size-4" aria-hidden />
      <span className="sr-only">{label}</span>
    </button>
  )
})

if (process.env.NODE_ENV !== "production") {
  const cls = overlayDismissButtonClassName
  console.assert(
    cls.includes("min-h-11") && cls.includes("min-w-11"),
    "overlay-dismiss: expected 44px mobile touch target"
  )
}
