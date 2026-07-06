"use client"

import * as React from "react"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/** ponytail: single source for overlay dismiss hit area + safe-bottom on mobile */
export const overlayDismissButtonClassName =
  "ring-offset-background focus:ring-ring data-[state=open]:bg-secondary z-50 inline-flex shrink-0 items-center justify-center rounded-md opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none min-h-11 min-w-11"

type OverlayDismissButtonProps = React.ComponentProps<"button"> & {
  label?: string
  /** "corner" = bottom-right on mobile, top-right on md+; "inline" = hug icon, no absolute positioning */
  variant?: "corner" | "inline"
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
      className={cn(
        overlayDismissButtonClassName,
        variant === "corner" &&
          "absolute bottom-[calc(0.75rem+var(--safe-bottom))] right-4 md:bottom-auto md:top-4 md:min-h-0 md:min-w-0 md:rounded-xs",
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
