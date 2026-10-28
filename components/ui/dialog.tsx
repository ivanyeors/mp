"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { OverlayDismissButton } from "@/components/ui/overlay-dismiss"
import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

/**
 * The phone drawer's grab handle, and its close control: drag it down past a
 * threshold (or flick it) to dismiss, or tap it. Pinned to the top while the
 * drawer scrolls, so no close button floats over the content.
 */
function DialogDrawerHandle() {
  const drag = React.useRef<{ y: number; t: number; dy: number } | null>(null)
  // A drag that springs back must not also count as a tap on the handle.
  const swallowClick = React.useRef(false)

  const drawerOf = (el: HTMLElement) => el.closest<HTMLElement>("[data-slot=dialog-content]")

  const settle = (el: HTMLElement) => {
    const drawer = drawerOf(el)
    if (!drawer) return
    drawer.style.transition = "transform 200ms cubic-bezier(0.32, 0.72, 0, 1)"
    drawer.style.transform = ""
    window.setTimeout(() => drawer.style.removeProperty("transition"), 220)
  }

  return (
    <DialogPrimitive.Close
      data-slot="dialog-drawer-handle"
      aria-label="Close"
      className="sticky top-0 z-10 order-first -mx-4 -mb-2 flex h-7 shrink-0 touch-none items-center justify-center bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:hidden"
      onPointerDown={(e) => {
        drag.current = { y: e.clientY, t: e.timeStamp, dy: 0 }
        swallowClick.current = false
        e.currentTarget.setPointerCapture(e.pointerId)
      }}
      onPointerMove={(e) => {
        const d = drag.current
        const drawer = drawerOf(e.currentTarget)
        if (!d || !drawer) return
        d.dy = Math.max(0, e.clientY - d.y)
        if (d.dy > 4) swallowClick.current = true
        drawer.style.transition = "none"
        drawer.style.transform = `translateY(${d.dy}px)`
      }}
      onPointerUp={(e) => {
        const d = drag.current
        drag.current = null
        if (!d || d.dy <= 4) return
        const flick = d.dy > 24 && d.dy / Math.max(1, e.timeStamp - d.t) > 0.5
        if (d.dy < 96 && !flick) return settle(e.currentTarget)
        // Touch never fires a click after a drag, so close explicitly; a
        // dialog whose owner keeps it open springs back.
        const handle = e.currentTarget
        swallowClick.current = false
        handle.click()
        swallowClick.current = true
        window.setTimeout(() => {
          if (drawerOf(handle)?.dataset.state === "open") settle(handle)
        }, 80)
      }}
      onPointerCancel={(e) => {
        drag.current = null
        settle(e.currentTarget)
      }}
      onClick={(e) => {
        if (swallowClick.current) e.preventDefault()
      }}
    >
      <span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
    </DialogPrimitive.Close>
  )
}

function DialogContent({
  className,
  children,
  hideClose = false,
  mobileDrawer = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  hideClose?: boolean
  /**
   * Below `md` the dialog is a slide-up drawer. Off only for an overlay with no
   * surface of its own (a transparent box of floating buttons, which brings its
   * own dismiss), which stays centred.
   */
  mobileDrawer?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          // ponytail: fixed (not relative) — relative was overriding fixed via twMerge and dumping modals at page bottom; fixed still contains absolute close btn
          "fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 md:rounded-lg",
          // Below md the dialog is a drawer: anchored to the bottom edge, full
          // width, sliding up, scrolling its own body. A flex column (not grid)
          // so the handle can stick to the top of the scrollport. `mx-auto`
          // centres it at 640-767px when a caller's `sm:max-w-*` narrows it.
          "max-md:flex max-md:max-h-[90dvh] max-md:flex-col max-md:overflow-y-auto max-md:overscroll-contain",
          mobileDrawer &&
            "max-md:inset-x-0 max-md:top-auto max-md:bottom-0 max-md:mx-auto max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-t-2xl max-md:border-x-0 max-md:border-b-0 max-md:px-4 max-md:pb-[calc(1rem+var(--safe-bottom))] max-md:duration-300 max-md:ease-[cubic-bezier(0.32,0.72,0,1)] max-md:data-[state=open]:slide-in-from-bottom max-md:data-[state=closed]:slide-out-to-bottom",
          mobileDrawer && !hideClose && "max-md:pt-0",
          className
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <>
            {mobileDrawer && <DialogDrawerHandle />}
            <DialogClose asChild>
              <OverlayDismissButton variant="corner" className={mobileDrawer ? "max-md:hidden" : undefined} />
            </DialogClose>
          </>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 text-center sm:text-left", className)} {...props} />
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-2", className)} {...props} />
}

const DialogTitle = DialogPrimitive.Title
const DialogDescription = DialogPrimitive.Description

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}


