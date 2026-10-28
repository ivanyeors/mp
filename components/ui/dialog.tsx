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

function DialogContent({
  className,
  children,
  hideClose = false,
  hideMobileClose = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  hideClose?: boolean
  /**
   * Hide the floating close X below `md` (desktop keeps its top-right X). For a
   * dialog with its own Cancel button: on a phone the X otherwise floats over
   * the last control and repeats Cancel.
   */
  hideMobileClose?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          // ponytail: fixed (not relative) — relative was overriding fixed via twMerge and dumping modals at page bottom; fixed still contains absolute close btn
          // max-md: flex column, not grid, so the sticky close button's containing block is the
          // whole scrolling content box (a grid item's containing block is only its own grid area).
          "fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:rounded-lg max-md:max-h-[90dvh] max-md:overflow-y-auto max-md:flex max-md:flex-col",
          className
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogClose asChild>
            {/*
              On mobile the dialog scrolls its own body (max-md:overflow-y-auto)
              and is centered by a transform, so neither `absolute` nor `fixed`
              keeps the X in view. Render it in flow after the content, stuck to
              the bottom of the scrollport; desktop keeps the top-right corner.
            */}
            <OverlayDismissButton variant="sticky" className={hideMobileClose ? "max-md:hidden" : undefined} />
          </DialogClose>
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


