"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "radix-ui"
import { useIsMobile } from "@/hooks/use-mobile"
import { OverlayDismissButton } from "@/components/ui/overlay-dismiss"
import {
  resolveSheetInsetBottomPadding,
  resolveSheetInsetTopPadding,
  sheetContentTopInsetClassName,
  type SheetMobilePreset,
} from "@/lib/sheet/safe-area"
import { cn } from "cn"

type SheetSide = "top" | "right" | "bottom" | "left"

/**
 * True while a SheetContent renders its pinned close button in the mobile
 * bottom-right corner, so SheetFooter can keep its actions clear of it.
 */
const SheetPinnedCloseContext = React.createContext(false)
type SheetDismissBehavior = "default" | "locked"
type SheetAnimation = "slide" | "fade-up"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  mobilePreset,
  animation = "slide",
  showDragHandle,
  insetTopPadding,
  insetBottomPadding,
  dismissBehavior = "default",
  disableMobileBottom = false,
  hideClose = false,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: SheetSide
  mobilePreset?: SheetMobilePreset
  animation?: SheetAnimation
  showDragHandle?: boolean
  insetTopPadding?: boolean
  insetBottomPadding?: boolean
  dismissBehavior?: SheetDismissBehavior
  /**
   * @deprecated Use `mobilePreset="full"` instead.
   */
  disableMobileBottom?: boolean
  hideClose?: boolean
}) {
  const isMobile = useIsMobile()
  const resolvedMobilePreset: SheetMobilePreset =
    mobilePreset ?? (disableMobileBottom ? "full" : "auto")

  const resolvedSide =
    isMobile && resolvedMobilePreset === "quick"
      ? "bottom"
      : isMobile &&
          resolvedMobilePreset !== "full" &&
          (side === "left" || side === "right")
        ? "bottom"
        : side

  const isFadeUp = animation === "fade-up"
  const isMobileBottomSheet = isMobile && resolvedSide === "bottom"
  const shouldShowDragHandle =
    showDragHandle ?? (isMobileBottomSheet && resolvedMobilePreset === "quick")
  const shouldInsetTopPadding = resolveSheetInsetTopPadding(
    insetTopPadding,
    isMobile,
    resolvedMobilePreset
  )
  const shouldInsetBottomPadding = resolveSheetInsetBottomPadding(
    insetBottomPadding,
    isMobileBottomSheet
  )
  const isDismissLocked = dismissBehavior === "locked"
  // Right/bottom sheets share a corner with the viewport, so the close X can be
  // pinned there with `fixed` and never scrolls away with the content.
  const hasPinnedClose =
    !hideClose && (resolvedSide === "right" || resolvedSide === "bottom")

  const handleEscapeKeyDown: React.ComponentProps<
    typeof SheetPrimitive.Content
  >["onEscapeKeyDown"] = (event) => {
    onEscapeKeyDown?.(event)
    if (isDismissLocked) event.preventDefault()
  }

  const handlePointerDownOutside: React.ComponentProps<
    typeof SheetPrimitive.Content
  >["onPointerDownOutside"] = (event) => {
    onPointerDownOutside?.(event)
    if (isDismissLocked) event.preventDefault()
  }

  const handleInteractOutside: React.ComponentProps<
    typeof SheetPrimitive.Content
  >["onInteractOutside"] = (event) => {
    onInteractOutside?.(event)
    if (isDismissLocked) event.preventDefault()
  }

  return (
    <SheetPortal>
      <SheetOverlay
        data-mobile-preset={resolvedMobilePreset}
        data-dismiss-behavior={dismissBehavior}
      />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        data-mobile-preset={resolvedMobilePreset}
        data-dismiss-behavior={dismissBehavior}
        data-resolved-side={resolvedSide}
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col gap-4 shadow-lg transition ease-in-out overflow-y-auto",
          // Timing: slower, gentler for fade-up
          isFadeUp
            ? "data-[state=open]:duration-700 data-[state=closed]:duration-500"
            : "data-[state=closed]:duration-300 data-[state=open]:duration-500",
          // Positioning per side
          resolvedSide === "right" && "inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
          resolvedSide === "left" && "inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
          resolvedSide === "top" && "inset-x-0 top-0 h-auto max-h-svh border-b",
          resolvedSide === "bottom" && "inset-x-0 bottom-0 h-auto max-h-[100svh] border-t",
          // Default directional slide animation
          !isFadeUp &&
            resolvedSide === "right" &&
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
          !isFadeUp &&
            resolvedSide === "left" &&
            "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
          !isFadeUp &&
            resolvedSide === "top" &&
            "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
          !isFadeUp &&
            resolvedSide === "bottom" &&
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
          // Fade-up: fade in with a subtle upward slide
          isFadeUp &&
            "data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-bottom-4 data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-bottom-4",
          isMobileBottomSheet && "rounded-t-2xl",
          shouldInsetTopPadding && sheetContentTopInsetClassName,
          shouldInsetBottomPadding && "pb-[calc(0.75rem+var(--safe-bottom))]",
          className,
          // A mobile bottom sheet must span the viewport: consumers' `sm:max-w-*`
          // (meant for the desktop side sheet) would otherwise leave it
          // left-aligned at 640-767px, away from the pinned close corner.
          isMobileBottomSheet && "w-full max-w-none sm:max-w-none"
        )}
        onEscapeKeyDown={handleEscapeKeyDown}
        onPointerDownOutside={handlePointerDownOutside}
        onInteractOutside={handleInteractOutside}
        {...props}
      >
        {shouldShowDragHandle && (
          <div
            data-slot="sheet-drag-handle"
            aria-hidden
            className="pointer-events-none px-4 pt-3"
          >
            <div className="bg-muted mx-auto h-1.5 w-12 rounded-full" />
          </div>
        )}
        <SheetPinnedCloseContext.Provider value={hasPinnedClose}>
          {children}
        </SheetPinnedCloseContext.Provider>
        {!hideClose && (
          <SheetPrimitive.Close asChild>
            {/*
              SheetContent is its own scroll container, so an `absolute` X
              scrolls away with the content; the rare left/top sheet keeps
              that corner, right/bottom sheets pin it to the viewport.
            */}
            <OverlayDismissButton variant={hasPinnedClose ? "pinned" : "corner"} />
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  const hasPinnedClose = React.useContext(SheetPinnedCloseContext)
  return (
    <div
      data-slot="sheet-footer"
      className={cn(
        "mt-auto flex flex-col gap-2 p-4 pb-[calc(1rem+var(--safe-bottom))] md:pb-4",
        // Keep footer actions out from under the pinned mobile close button.
        hasPinnedClose && "max-md:pr-[4.25rem]",
        className
      )}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-foreground font-semibold", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  sheetStickyBottomClassName,
  sheetStickyTopClassName,
} from "@/lib/sheet/safe-area"

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
